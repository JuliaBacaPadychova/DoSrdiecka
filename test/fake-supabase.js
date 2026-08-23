// Falošná (v pamäti bežiaca) náhrada za Supabase REST/Auth/Storage API,
// používaná LEN v lokálnych testoch — aby sme mohli otestovať celý tok
// (kalendár -> výber výrobkov -> objednávka -> e-mail, aj admin časť)
// bez toho, aby sme potrebovali skutočný Supabase účet alebo internet.
// Nie je súčasťou nasadenej aplikácie.

const http = require("http");

function startFakeSupabase() {
  const db = {
    categories: [
      { id: "chlebik", name: "Chlebík", note: "", sort_order: 1 },
      { id: "zakusky", name: "Zákusky", note: "min. 6 ks", sort_order: 2 },
      { id: "torty", name: "Torty", note: "1 torta na deň", sort_order: 3 },
    ],
    products: [
      { id: "p-chlebik", category_id: "chlebik", name: "Kváskový chlebík", sub: "", description: "", alt_text: "", price: 3, min_qty: 1, min_label: "", allergens: "1", image_url: "/assets/img/chlebik.jpg", active: true, sort_order: 1 },
      { id: "p-choux", category_id: "zakusky", name: "Choux", sub: "Pistáciovo mangový", description: "", alt_text: "", price: 3, min_qty: 6, min_label: "min. 6 ks", allergens: "1,3,6,7,8", image_url: "/assets/img/choux.jpg", active: true, sort_order: 1 },
      { id: "p-brownie", category_id: "torty", name: "Brownie torta", sub: "Ø 12 cm", description: "", alt_text: "", price: 40, min_qty: 1, min_label: "za tortu", allergens: "1,3,6,7", image_url: "/assets/img/brownie.jpg", active: true, sort_order: 1 },
    ],
    open_days: [],
    orders: [],
    order_items: [],
    site_settings: [{ id: true, hero_title: "Každý kúsok ide predsa do srdiečka.", hero_lead: "Testovací úvod.", about_text: "Testovacia pätička." }],
  };

  const ADMIN_EMAIL = "test-admin@dosrdiecka.sk";
  const ADMIN_PASSWORD = "tajneheslo123";
  let tokenCounter = 0;
  const validTokens = new Set();
  const validRefreshTokens = new Set();

  function dayCapacityRows() {
    return db.open_days.map((d) => {
      const used = (cat) =>
        db.order_items
          .filter((oi) => oi.category_id === cat)
          .filter((oi) => {
            const order = db.orders.find((o) => o.id === oi.order_id);
            return order && order.day === d.day && order.status !== "zrusena";
          })
          .reduce((s, oi) => s + oi.qty, 0);
      return {
        day: d.day,
        is_open: d.is_open,
        cap_zakusky: d.cap_zakusky,
        cap_torty: d.cap_torty,
        remaining_zakusky: d.cap_zakusky - used("zakusky"),
        remaining_torty: d.cap_torty - used("torty"),
      };
    });
  }

  function parseFilters(searchParams) {
    const filters = [];
    for (const [key, value] of searchParams.entries()) {
      if (["select", "order", "limit", "on_conflict"].includes(key)) continue;
      const m = value.match(/^(eq|gte|lte|gt|lt|is)\.(.*)$/);
      if (m) filters.push({ field: key, op: m[1], value: m[2] });
    }
    return filters;
  }

  function applyFilters(rows, filters) {
    return rows.filter((row) =>
      filters.every((f) => {
        let v = row[f.field];
        if (f.field === "day" && v && v.length > 10) v = v.slice(0, 10);
        switch (f.op) {
          case "eq": return String(v) === f.value;
          case "gte": return v >= f.value;
          case "lte": return v <= f.value;
          case "gt": return v > f.value;
          case "lt": return v < f.value;
          case "is": return f.value === "true" ? v === true : f.value === "false" ? v === false : v === null;
          default: return true;
        }
      })
    );
  }

  function applyOrder(rows, orderParam) {
    if (!orderParam) return rows;
    const [field, dir] = orderParam.split(".");
    const sorted = [...rows].sort((a, b) => (a[field] > b[field] ? 1 : a[field] < b[field] ? -1 : 0));
    if (dir === "desc") sorted.reverse();
    return sorted;
  }

  function tableFor(name) {
    if (name === "day_capacity") return dayCapacityRows();
    return db[name];
  }

  function readBody(req) {
    return new Promise((resolve) => {
      const chunks = [];
      req.on("data", (c) => chunks.push(c));
      req.on("end", () => {
        const raw = Buffer.concat(chunks).toString("utf8");
        try { resolve(raw ? JSON.parse(raw) : {}); } catch { resolve({}); }
      });
    });
  }

  function send(res, status, body) {
    res.statusCode = status;
    res.setHeader("Content-Type", "application/json");
    res.end(body === undefined ? "" : JSON.stringify(body));
  }

  function createOrderRpc(args) {
    const day = db.open_days.find((d) => d.day === args.p_day);
    if (!day || !day.is_open) throw { message: "day_closed" };
    if (!Array.isArray(args.p_items) || args.p_items.length === 0) throw { message: "no_items" };

    const cap = dayCapacityRows().find((d) => d.day === args.p_day);
    let addZ = 0, addT = 0, total = 0;
    const resolvedItems = [];
    for (const item of args.p_items) {
      const product = db.products.find((p) => p.id === item.product_id && p.active);
      if (!product) throw { message: "product_not_found" };
      const qty = parseInt(item.qty, 10);
      if (!Number.isInteger(qty) || qty <= 0 || qty > 200) throw { message: "invalid_qty" };
      if (qty < product.min_qty) throw { message: "below_minimum" };
      if (product.category_id === "zakusky") addZ += qty;
      if (product.category_id === "torty") addT += qty;
      total += product.price * qty;
      resolvedItems.push({ product, qty });
    }
    if (addZ > cap.remaining_zakusky) throw { message: "capacity_zakusky" };
    if (addT > cap.remaining_torty) throw { message: "capacity_torty" };

    const orderId = "order-" + (db.orders.length + 1);
    db.orders.push({
      id: orderId, day: args.p_day, customer_name: args.p_name, phone: args.p_phone,
      email: args.p_email, note: args.p_note, status: "nova", total_estimate: total,
      created_at: new Date().toISOString(),
    });
    for (const { product, qty } of resolvedItems) {
      db.order_items.push({
        id: "item-" + (db.order_items.length + 1), order_id: orderId, product_id: product.id,
        category_id: product.category_id, name_snapshot: product.name, sub_snapshot: product.sub,
        price_snapshot: product.price, qty,
      });
    }
    return { order_id: orderId, total };
  }

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");

    if (url.pathname === "/auth/v1/token" && req.method === "POST") {
      const grantType = url.searchParams.get("grant_type");
      const body = await readBody(req);
      if (grantType === "password") {
        if (body.email === ADMIN_EMAIL && body.password === ADMIN_PASSWORD) {
          const token = "access-" + (++tokenCounter);
          const refresh = "refresh-" + tokenCounter;
          validTokens.add(token);
          validRefreshTokens.add(refresh);
          return send(res, 200, { access_token: token, refresh_token: refresh, user: { email: body.email } });
        }
        return send(res, 400, { message: "Invalid login credentials" });
      }
      if (grantType === "refresh_token") {
        if (validRefreshTokens.has(body.refresh_token)) {
          const token = "access-" + (++tokenCounter);
          validTokens.add(token);
          return send(res, 200, { access_token: token, refresh_token: body.refresh_token });
        }
        return send(res, 400, { message: "invalid refresh token" });
      }
      return send(res, 400, { message: "unsupported grant" });
    }

    if (url.pathname === "/auth/v1/user" && req.method === "GET") {
      const auth = req.headers.authorization || "";
      const token = auth.replace("Bearer ", "");
      if (validTokens.has(token)) return send(res, 200, { email: ADMIN_EMAIL });
      return send(res, 401, { message: "invalid token" });
    }

    if (url.pathname.startsWith("/storage/v1/object/product-images/") && req.method === "POST") {
      const chunks = [];
      req.on("data", (c) => chunks.push(c));
      req.on("end", () => {
        const objectPath = url.pathname.replace("/storage/v1/object/product-images/", "");
        send(res, 200, { Key: objectPath });
      });
      return;
    }

    if (url.pathname === "/rest/v1/rpc/create_order" && req.method === "POST") {
      const body = await readBody(req);
      try {
        const result = createOrderRpc(body);
        return send(res, 200, result);
      } catch (err) {
        return send(res, 400, { message: err.message || "error" });
      }
    }

    const restMatch = url.pathname.match(/^\/rest\/v1\/([a-z_]+)$/);
    if (restMatch) {
      const table = restMatch[1];
      const filters = parseFilters(url.searchParams);

      if (req.method === "GET") {
        let rows = applyFilters(tableFor(table), filters);
        rows = applyOrder(rows, url.searchParams.get("order"));
        const limit = url.searchParams.get("limit");
        if (limit) rows = rows.slice(0, parseInt(limit, 10));
        if (table === "orders" && url.searchParams.get("select") === "*,order_items(*)") {
          rows = rows.map((o) => ({ ...o, order_items: db.order_items.filter((oi) => oi.order_id === o.id) }));
        }
        return send(res, 200, rows);
      }

      if (req.method === "POST") {
        const body = await readBody(req);
        const onConflict = url.searchParams.get("on_conflict");
        if (onConflict && db[table]) {
          const idx = db[table].findIndex((r) => r[onConflict] === body[onConflict]);
          if (idx >= 0) { db[table][idx] = { ...db[table][idx], ...body }; return send(res, 200, [db[table][idx]]); }
        }
        const row = { id: table + "-" + (db[table].length + 1), ...body };
        db[table].push(row);
        return send(res, 200, [row]);
      }

      if (req.method === "PATCH") {
        const body = await readBody(req);
        const rows = applyFilters(tableFor(table), filters);
        rows.forEach((row) => Object.assign(row, body));
        return send(res, 200, rows);
      }

      if (req.method === "DELETE") {
        const before = db[table].length;
        db[table] = db[table].filter((row) => !applyFilters([row], filters).length);
        return send(res, 200, { deleted: before - db[table].length });
      }
    }

    send(res, 404, { error: "not_found_in_fake_supabase", path: url.pathname });
  });

  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({
        url: `http://127.0.0.1:${port}`,
        close: () => new Promise((r) => server.close(r)),
        db,
        adminCredentials: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
      });
    });
  });
}

module.exports = { startFakeSupabase };
