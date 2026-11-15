# CampusStationery

An online stationery shop for a university campus. Students and staff browse products, order online,
pay with M-Pesa or cash, and collect on campus or get campus delivery. Shop staff run everything from an
admin panel: products, stock, orders, payments, customers, reports, admin accounts and the audit trail.

* **Front end:** HTML, CSS, Bootstrap 5, Bootstrap Icons, JavaScript
* **Admin panel:** HTML, CSS, Bootstrap 5, Font Awesome, Chart.js, JavaScript
* **Back end:** Node.js with Express
* **Database:** MySQL or MariaDB (XAMPP); TiDB Cloud when hosted online
* **Payments:** Safaricom Daraja M-Pesa (STK Push), with a demo mode for presentations
* **Security:** bcrypt and scrypt hashing, prepared statements, two factor authentication (2FA), AES 256 encryption, audit trail

## Documentation

| Document | What it covers |
|---|---|
| `docs/CampusStationery_User_Manual.docx` (and `.pdf`) | Installing, the customer guide, the admin guide, security, hosting online, troubleshooting |
| `docs/CampusStationery_System_Documentation.docx` (and `.pdf`) | Requirements, architecture, use case, flowchart, sequence, class and ER diagrams, data dictionary, implementation, test results, deployment, maintenance |
| `docs/database-er-diagram.png` | Entity relationship diagram of the 9 tables |
| `database/campus_stationery.sql` | Documented SQL script of the whole database |

---

## Quick start (Windows with XAMPP)

First install **Node.js** (LTS) from nodejs.org and **XAMPP** from apachefriends.org, then start **MySQL**
in the XAMPP Control Panel. Then choose one way:

**A. Setup wizard (easiest).** Run `setup/CampusStationery-Setup-1.0.0.exe` from this repository. Enter the MySQL port and password when asked, click Install, then open CampusStationery from
the desktop. If Windows says "Windows protected your PC", click More info, then Run anyway.

**B. From this folder.** Double click **`setup.bat`** (installs the packages and asks for your MySQL port and
password), then **`start.bat`**. phpMyAdmin shows the port at the top: `Server: 127.0.0.1:3306`.

**C. Any computer.**

```bash
npm install
copy .env.example .env      (Mac/Linux: cp .env.example .env), then edit DB_PORT and DB_PASSWORD
npm start
```

* Shop: http://localhost:5000
* Admin panel: http://localhost:5000/admin/login.html

You never need to import an SQL file. The server creates the database `school_project_db`, every table and
the starting products the first time it runs, and upgrades older copies of the database automatically.

### First logins

| Who | Email | Password |
|---|---|---|
| Super admin | admin@campusstationery.com | Admin@123, then the 6 digit code shown in the server window (change the password after the first login) |
| Customer | register on the shop's **Register** page | your own |

### Useful commands

| Command | What it does |
|---|---|
| `npm start` | Starts the system |
| `npm run demo-data` | Adds 6 sample customers and about 30 orders over 14 days so the dashboard and reports have data (log in as `<name>@demo.campusstationery.com` / `Demo1234`) |
| `npm run reset-admin` | Resets admin@campusstationery.com to Admin@123 and removes a lost authenticator app. Another admin: `npm run reset-admin -- someone@example.com NewPass123` |
| `npm test` | Runs the 20 automated system tests (MySQL must be running). The tests clean up after themselves |

---

## How the system meets the Deliverable 4 guidelines

| Guideline | Where to see it |
|---|---|
| Database: entities, attributes, normalisation, relationships | 9 tables in third normal form, linked by foreign keys. `database/campus_stationery.sql`, `docs/database-er-diagram.png`, data dictionary in the system documentation |
| Uniformity and ease of use | The same menu, colours and layout on every page of the shop and the admin panel |
| Add, delete, edit, browse and search | Admin panel: Products, Categories, Users, Orders, Admin accounts. Shop: search, category and price filters, sorting |
| Help facilities and error messages | Shop Help centre and admin Help (F1 on any page). A clear message on every form and for every server or database problem |
| Main transaction | Placing an order: stock is checked and reduced in one database transaction, then paid with M-Pesa or cash (`services/orderService.js`) |
| Levels of access | Customer, admin and super admin. Login, logout, registration and forgot password |
| Reports | Sales, Orders, and Inventory and Stock reports with the shop name, logo, date generated, filters and sorting. Print, save as PDF or export CSV |
| Frameworks, libraries and APIs | Bootstrap 5, Bootstrap Icons, Font Awesome, Chart.js, Express, mysql2, bcrypt, qrcode, Safaricom Daraja M-Pesa API |
| Validation, error handling, key trapping and recovery | Validation in the browser and on the server; phone, code and number boxes refuse letters; unsaved changes warning; offline notice; failed orders roll back |
| Audit trail | Every login, 2FA event, order, payment and data change, with the person, time and IP address (Admin panel, Audit trail) |
| Security | bcrypt and scrypt password hashing, prepared statements, **two factor authentication** (authenticator app or emailed codes), AES 256 encryption of 2FA keys, login lockout, signed tokens, HTTPS when hosted |
| Packaging and deployment | **Setup wizard** `setup/CampusStationery-Setup-1.0.0.exe` (built from `installer/`); `setup.bat` and `start.bat`; **online hosting** with `render.yaml` |
| User manual and documentation | `docs/` (user manual and system documentation, Word and PDF) and this README |
| Coding practices | Separate folders for routes, services, middleware, utilities and settings, comments throughout, 20 automated tests |

---

## What the system does

### Customers (front end)
* Browse, search, filter by category and price, sort, view product details
* Cart that never allows more than the stock available, and refreshes prices from the database
* Register, login, logout, forgot password (emailed reset link), My Account (profile and password)
* Optional **two step verification**: a 6 digit code sent by email at every login
* **Main transaction: place an order.** Stock is checked and reduced inside one database transaction,
  so two people can never buy the last item at the same time
* Pay with **M-Pesa** (prompt on the phone) or **cash on collection**; retry a failed M-Pesa payment
* My Orders: status of every order, cancel a pending order (stock is returned), print a receipt
* Help centre with searchable FAQs; F1 opens help, `/` jumps to search

### Admin panel
* **Two factor sign in** for every admin: a code from an authenticator app (Google or Microsoft
  Authenticator, linked by QR code) or a 6 digit code by email
* Dashboard: sales totals, open orders, low stock, 7 day sales chart, latest orders, recent activity
* **Orders:** filter by status, payment and date, search, sort; move orders through
  Pending → Processing → Ready for Collection → Completed (only valid steps are offered);
  cancel (stock returned automatically); record cash or M-Pesa payments; print an invoice
* **Reports:** Sales (by day, product, category or payment method), Orders, Inventory and Stock.
  Date range, filters and sorting. Printable with the shop name, logo, date generated, who prepared
  it and the filters used (Print / Save as PDF), and Export CSV for Excel
* Manage data: add, edit, delete, search, sort and print Products, Categories and Users
* Access levels: **super admin** (everything, including admin accounts and resetting an admin's 2FA) and **admin**
* **Audit trail** of every admin and customer action, with time and IP address

### Security
* Passwords hashed: bcrypt for customers, scrypt for admins. Reset tokens and emailed codes stored only as SHA 256 hashes
* Authenticator app keys encrypted with AES 256 GCM; TOTP codes (RFC 6238) cannot be reused
* Every SQL statement uses prepared statements (placeholders), so SQL injection is blocked
* Signed login tokens; customer tokens cannot open admin routes
* Account lockout after 5 wrong passwords for 5 minutes; 5 wrong codes end a sign in
* Prices and stock are always taken from the database, never trusted from the browser
* Only public folders are served, so `.env` and the code in `config/` cannot be downloaded
* HTTPS and Strict Transport Security when hosted online

---

## Putting it online (Render and TiDB Cloud)

1. **Database:** sign up at tidbcloud.com, create a free **Starter** cluster (Frankfurt if offered), click
   **Connect**, **Generate Password**, and note the host, port (4000), user and password.
2. **Web host:** sign up at render.com with GitHub. Click **New**, then **Blueprint**, and choose this
   repository. Render reads `render.yaml` and asks for `DB_HOST`, `DB_USER` and `DB_PASSWORD`.
   Everything else (including a random `APP_SECRET`, `DB_SSL=true` and Kenya time) is set for you.
3. When the service shows **Live**, open its address. The admin panel is at `/admin/login.html`.
4. Render's free plan cannot send email, so the first admin sign in code is in the service's **Logs**.
   Change the admin password straight away, then link an authenticator app under **Security**.

Free plans change over time, so check the providers' current terms. A free Render service sleeps after
about 15 minutes without visitors and takes about a minute to wake up. Full steps are in section 6 of the user manual.

---

## Settings (.env)

See `.env.example` for every option. The important ones:

| Setting | Meaning |
|---|---|
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` | Your MySQL connection (XAMPP default: 127.0.0.1, 3306, root, empty) |
| `DATABASE_URL`, `DB_SSL`, `DB_SSL_CA`, `DB_TIMEZONE` | Online database: one address, encrypted connection, time zone (+03:00) |
| `PORT` | Web server port (default 5000) |
| `APP_SECRET` | Signs logins and encrypts 2FA keys. Created automatically on a laptop; always set it when hosted |
| `MPESA_CONSUMER_KEY`, `MPESA_CONSUMER_SECRET`, `MPESA_PASSKEY` | Daraja sandbox keys. Leave empty for demo mode |
| `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS` | Email account for reset links and sign in codes. Leave empty to print them in the server window |

### M-Pesa
Without Daraja keys the system runs in **demo mode**: the payment prompt is simulated and confirms
after about 6 seconds, so the whole flow can be shown without a phone. A phone number ending in `000`
simulates a customer who cancels the prompt.

With keys from the Daraja portal (developer.safaricom.co.ke) the system sends a real sandbox
STK Push and checks the result with the STK Push Query API, which works on a laptop.
Safaricom's callback only reaches the system once it is hosted online with a public https address
set in `MPESA_CALLBACK_URL`. Check the Daraja documentation for the current sandbox details.

---

## Folder structure

```
server.js              starts the web server
config/                database connection, automatic schema, shop settings
routes/                API endpoints (products, users, orders, payments, admin)
services/              order and payment business rules (the main transaction)
middleware/            login checks
utils/                 security, two factor authentication, audit trail, email, M-Pesa, error messages
pages/, index.html     customer pages
js/, css/, assets/     customer scripts, styles and images
admin/                 admin panel pages, scripts and styles
database/              full database script (design reference)
docs/                  user manual, system documentation and database diagram
scripts/               reset-admin and demo-data commands
tests/                 automated system tests (npm test)
installer/             Windows setup wizard (NSIS script, icon, pictures)
render.yaml            hosting blueprint for Render
setup.bat, start.bat   one click setup and start for Windows
```

## Troubleshooting

| Message | Fix |
|---|---|
| Cannot reach the database: MySQL is not running | Start MySQL in XAMPP. Check `DB_PORT` matches phpMyAdmin |
| MySQL rejected the user name or password | Fix `DB_USER` / `DB_PASSWORD` in `.env`, then restart |
| Where is the 6 digit sign in code? | In the server window when email is not set up (online: Render's Logs), or in your authenticator app |
| The app code is not accepted | Set the phone's time to automatic and use the newest code, or choose "Use an email code instead" |
| `EADDRINUSE` | The server is already running in another window. Close it or change `PORT` |
| `localhost refused to connect` | The server is not running. Run `start.bat` or `npm start` |
| `Could not read package.json` | You are in the wrong folder. Open the folder that contains `server.js` |
| Products do not load when opening pages with Live Server | Keep `npm start` running; pages call the API on port 5000 |

If your MySQL password contains `&`, `%` or `^`, type the `.env` file by hand instead of using `setup.bat`.
