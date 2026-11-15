# Windows installer

`CampusStationery.nsi` builds **CampusStationery-Setup-1.0.0.exe**, a normal Windows installation wizard.

## What the installer does

1. Checks that Node.js is installed. If it is missing, it offers to open the Node.js download page.
2. Copies the whole system, including its packages, so no internet is needed during installation.
3. Shows a **Database settings** page for the MySQL port, password and database name, and saves them in `.env`.
4. Adds a desktop shortcut and a Start menu folder: Start CampusStationery, Open the shop, Open the admin panel,
   User manual, Add sample data, Reset admin password, Edit settings and Uninstall.
5. Registers an uninstaller under Settings, Apps. Uninstalling never touches the MySQL database.

It installs for the current user in `%LOCALAPPDATA%\Programs\CampusStationery`, so administrator rights are not needed.
Reinstalling over an earlier copy keeps its `.env` settings.

## Building the installer

1. Install NSIS 3 from nsis.sourceforge.io.
2. In the project folder run `npm install --omit=dev` so `node_modules` holds only what the system needs.
3. Right click `installer\CampusStationery.nsi` and choose **Compile NSIS Script**
   (or run `makensis installer\CampusStationery.nsi`).
4. The setup file appears in the `dist` folder.

On Linux: `sudo apt install nsis`, then the same `makensis` command.

## Note about Windows SmartScreen

The setup file is not code signed (signing certificates cost money), so Windows may show
"Windows protected your PC" the first time. Click **More info**, then **Run anyway**.
