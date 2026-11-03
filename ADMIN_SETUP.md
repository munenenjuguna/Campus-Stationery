# CampusStationery Admin Panel: setup in 3 minutes

## 1. Copy the files into the repo

Unzip and copy these into the root of Campus-Stationery (same level as `index.html`):

```
admin/                 -> new folder (login.html, index.html, admin.css, admin.js)
routes/admin.js        -> goes next to your existing auth routes
config/adminDb.js      -> goes next to your existing config file
database/admin_tables.sql
```

## 2. Install the MySQL driver (safe even if already installed)

```
npm install mysql2
```

## 3. Add two lines to your server file (server.js or app.js)

Put them after `const app = express();` and before `app.listen(...)`:

```js
const path = require('path');                       // skip if already there
app.use('/api/admin', require('./routes/admin'));
app.use('/admin', express.static(path.join(__dirname, 'admin')));
```

## 4. Point it at the same database

Open `config/adminDb.js`. It reads `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` from `.env`.
If your `config/db.js` uses different names or hard coded values, copy those same values in.

## 5. Run and open

```
node server.js        (or npm start)
```

Open http://localhost:PORT/admin/login.html

First login (created automatically):
  Email: admin@campusstationery.com
  Password: Admin@123

The login page shows a green dot with the database name when the connection works.

## What to demo for Deliverable 3

| Marking point | Where to show it |
|---|---|
| Database created in a DBMS | Login page green dot, sidebar footer shows DB name and MySQL version |
| Admin panel designed and developed | Dashboard, sidebar, every table page |
| Admin panel connected to the database | Add a product, refresh the customer site, it appears. Edit stock, dashboard updates |
| Front end connected to the database | Customer pages read the same `products` table you just edited |

Extras that also score in Deliverable 4: two access levels (super admin, admin), audit trail, hashed passwords,
prepared statements, login lockout after 5 failures, form validation, friendly error messages, F1 help,
keyboard shortcuts, CSV export, printable report with shop name, logo, date, filter and sort.

## If something goes wrong

* Red dot on login: MySQL is off, or the values in `config/adminDb.js` do not match your database.
* "Cannot GET /admin": the `express.static` line was not added, or the server was not restarted.
* "Install bcrypt or bcryptjs": only appears when setting a customer password. Run `npm install bcryptjs`.
