/**
 * Queries over the client-team's offline CSV drop (pincode orders,
 * product-level new-vs-returning mix, product-level sales/reversals) —
 * see supabase/migrations/0005_offline_client_data.sql and
 * scripts/seed_offline_data.ts. Pincode data is a genuine monthly time
 * series; the two product tables are an all-time snapshot as of the last
 * import (`asOf`), not a trend — every consumer of those two must say so.
 */
import { getDb } from "./db";
import { cityForPincode } from "./geo";

export interface PincodeMonth {
  month: string;           // YYYY-MM-01
  postalCode: string;
  city: string;
  orders: number;
  aov: number | null;
  qtyPerOrder: number | null;
}

export async function getPincodeOrders(clientId: string): Promise<PincodeMonth[]> {
  const db = await getDb();
  const rows = await db.query<{ month: string; postal_code: string; orders: number; aov: number | null; qty_per_order: number | null }>(
    `select month::text as month, postal_code, orders, aov, qty_per_order
     from pincode_orders where client_id = $1 order by month, orders desc`,
    [clientId]);
  return rows.map((r) => ({
    month: r.month, postalCode: r.postal_code, city: cityForPincode(r.postal_code),
    orders: Number(r.orders), aov: r.aov != null ? Number(r.aov) : null,
    qtyPerOrder: r.qty_per_order != null ? Number(r.qty_per_order) : null,
  }));
}

export interface ProductPerformance {
  product: string;
  vendor: string | null;
  type: string | null;
  newCustomers: number;
  returningCustomers: number;
  newOrders: number;
  returningOrders: number;
  netSales: number;
  reversals: number;        // negative = refunded amount
  asOf: string | null;
}

/** Product-level new-vs-returning mix, merged with sales/reversals by product title. All-time snapshot. */
export async function getProductPerformance(clientId: string): Promise<ProductPerformance[]> {
  const db = await getDb();
  const [mix, sales] = await Promise.all([
    db.query<{ product_title: string; segment: string; customers: number; orders: number; as_of: string }>(
      `select product_title, segment, customers, orders, as_of::text as as_of
       from product_customer_mix where client_id = $1`, [clientId]),
    db.query<{ product_title: string; vendor: string | null; product_type: string | null;
      segment: string; net_sales: number | null; sales_reversals: number | null; as_of: string }>(
      `select product_title, vendor, product_type, segment, net_sales, sales_reversals, as_of::text as as_of
       from product_sales where client_id = $1`, [clientId]),
  ]);

  const byProduct = new Map<string, ProductPerformance>();
  const get = (name: string) => {
    let p = byProduct.get(name);
    if (!p) {
      p = { product: name, vendor: null, type: null, newCustomers: 0, returningCustomers: 0,
        newOrders: 0, returningOrders: 0, netSales: 0, reversals: 0, asOf: null };
      byProduct.set(name, p);
    }
    return p;
  };
  for (const r of mix) {
    const p = get(r.product_title);
    p.asOf = r.as_of;
    if (r.segment === "new") { p.newCustomers += Number(r.customers); p.newOrders += Number(r.orders); }
    else { p.returningCustomers += Number(r.customers); p.returningOrders += Number(r.orders); }
  }
  for (const r of sales) {
    const p = get(r.product_title);
    p.vendor = r.vendor; p.type = r.product_type; p.asOf = r.as_of;
    p.netSales += Number(r.net_sales ?? 0);
    p.reversals += Number(r.sales_reversals ?? 0);
  }
  return [...byProduct.values()].sort((a, b) => b.netSales - a.netSales);
}
