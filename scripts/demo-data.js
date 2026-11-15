// scripts/demo-data.js
// Adds sample customers and about 30 orders spread over the last 14 days, so the dashboard chart
// and the reports have something to show during a demonstration.
//   npm run demo-data
// Sample customers use emails ending in @demo.campusstationery.com (password Demo1234).
// Running it again does nothing. Stock is topped up first so real stock is not used up.

require('dotenv').config({ quiet: true });
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const db = require('../config/db');
const { ensureSchema } = require('../config/schema');

const CUSTOMERS = [
  ['Achieng Otieno', '254712000101', 'student'], ['Brian Kiptoo', '254722000202', 'student'],
  ['Faith Wanjiru', '254733000303', 'student'], ['Kevin Mutua', '254701000404', 'student'],
  ['Dr. Grace Njeri', '254711000505', 'staff'], ['Samuel Omondi', '254745000606', 'student']
];

const pick = list => list[Math.floor(Math.random() * list.length)];
const rand = (min, max) => min + Math.floor(Math.random() * (max - min + 1));

(async () => {
  await ensureSchema();
  const [existing] = await db.query("SELECT COUNT(*) AS n FROM users WHERE email LIKE '%@demo.campusstationery.com'");
  if (existing[0].n > 0) {
    console.log('Sample data is already loaded. Nothing to do.');
    process.exit(0);
  }

  const [products] = await db.query('SELECT id, price FROM products WHERE is_active = 1');
  if (!products.length) throw new Error('Add some products first.');

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query('UPDATE products SET stock_quantity = stock_quantity + 40 WHERE is_active = 1');

    const hash = await bcrypt.hash('Demo1234', 10);
    const userIds = [];
    for (const [name, phone, role] of CUSTOMERS) {
      const email = name.toLowerCase().replace(/[^a-z]+/g, '.').replace(/^\.|\.$/g, '') + '@demo.campusstationery.com';
      const [r] = await conn.query('INSERT INTO users (full_name, email, phone, password, role, created_at) VALUES (?, ?, ?, ?, ?, DATE_SUB(NOW(), INTERVAL 20 DAY))',
        [name, email, phone, hash, role]);
      userIds.push({ id: r.insertId, phone });
    }

    let count = 0;
    for (let daysAgo = 13; daysAgo >= 0; daysAgo--) {
      for (let n = rand(1, 3); n > 0; n--) {
        const user = pick(userIds);
        const delivery = Math.random() < 0.35;
        const status = daysAgo > 3 ? pick(['Completed', 'Completed', 'Completed', 'Cancelled']) : pick(['Pending', 'Processing', 'Ready for Collection', 'Completed']);
        const method = Math.random() < 0.7 ? 'M-Pesa' : 'Cash on Collection';
        const created = `DATE_SUB(NOW(), INTERVAL ${daysAgo * 24 + rand(0, 10)} HOUR)`;
        const ref = 'CS-DEMO-' + crypto.randomBytes(3).toString('hex').toUpperCase();

        const [o] = await conn.query(
          `INSERT INTO orders (order_ref, user_id, delivery_method, delivery_location, delivery_fee, contact_phone, status, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ${created})`,
          [ref, user.id, delivery ? 'Campus Delivery' : 'Campus Pickup', delivery ? pick(['Hostel A, Room 4', 'Hostel C, Room 21', 'Library Block', 'Science Complex']) : null,
            delivery ? 100 : 0, user.phone, status]);

        const chosen = [...products].sort(() => Math.random() - 0.5).slice(0, rand(1, 3));
        let total = delivery ? 100 : 0;
        for (const p of chosen) {
          const qty = rand(1, 3);
          total += qty * Number(p.price);
          await conn.query('INSERT INTO order_items (order_id, product_id, quantity, unit_price) VALUES (?, ?, ?, ?)', [o.insertId, p.id, qty, p.price]);
          if (status !== 'Cancelled') await conn.query('UPDATE products SET stock_quantity = stock_quantity - ? WHERE id = ?', [qty, p.id]);
        }

        const paid = status === 'Completed' || (method === 'M-Pesa' && status !== 'Cancelled' && Math.random() < 0.8);
        await conn.query(
          `INSERT INTO payments (order_id, method, amount, phone, status, mpesa_receipt, created_at, paid_at, result_message)
           VALUES (?, ?, ?, ?, ?, ?, ${created}, ${paid ? created : 'NULL'}, 'Sample data')`,
          [o.insertId, method, total, user.phone, paid ? 'Paid' : (status === 'Cancelled' ? 'Cancelled' : 'Pending'),
            paid && method === 'M-Pesa' ? 'SMP' + crypto.randomBytes(4).toString('hex').toUpperCase() : null]);
        count++;
      }
    }
    await conn.query("INSERT INTO audit_log (actor_type, actor_email, action, details) VALUES ('system', 'demo-data script', 'DEMO_DATA_LOADED', ?)",
      [JSON.stringify({ customers: CUSTOMERS.length, orders: count })]);
    await conn.commit();
    console.log(`Added ${CUSTOMERS.length} sample customers and ${count} sample orders. Open the admin dashboard and Reports to see them.`);
    process.exit(0);
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
})().catch(err => {
  console.error('Could not load sample data: ' + err.message);
  process.exit(1);
});
