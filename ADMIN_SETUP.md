# How to run CampusStationery

## 1. Start MySQL
XAMPP users: open the XAMPP Control Panel and click Start next to MySQL.

## 2. Create the database (first time only)
In phpMyAdmin, open the Import tab and import `database/campus_stationery.sql`.
Or from a terminal:

```
mysql -u root -p < database/campus_stationery.sql
```

This creates `school_project_db` with the `users` and `products` tables and 8 starting products.
The admin tables are created automatically when the server starts handling admin requests.

## 3. Install packages

```
npm install
```

## 4. Optional `.env` file (project root)
Only needed if your MySQL root user has a password or you want a different port.

```
PORT=5000
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=
DB_NAME=school_project_db
```

## 5. Start the server

```
npm start
```

Wait for: `Server running on http://localhost:5000`

## 6. Open
* Shop: http://localhost:5000
* Admin panel: http://localhost:5000/admin/login.html
* First admin login: admin@campusstationery.com / Admin@123 (change it under My password)

## Demo for Deliverable 3
1. Log in to the admin panel. The green dot shows the database name.
2. Open Products and add a new item, or change the price or stock of an existing one.
3. Open the shop products page and refresh. The change appears, because the shop now reads from MySQL through `/api/products`.
4. Open Audit trail to show who made the change and when.

## If something goes wrong
* Red dot on the admin login: MySQL is off, or the `.env` values do not match your MySQL.
* `ER_BAD_DB_ERROR`: the database was not created. Do step 2.
* `ER_ACCESS_DENIED_ERROR`: wrong `DB_USER` or `DB_PASSWORD` in `.env`.
* `EADDRINUSE`: another server is already on port 5000. Close the other terminal.
* `Cannot find module 'bcryptjs'`: run `npm install` again.
* The shop shows products but admin changes do not appear: the shop must be opened while `npm start` is running. If you change `PORT`, also change `http://localhost:5000` at the bottom of `js/products.js` and `js/product-details.js`.
