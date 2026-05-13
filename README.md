# MyResearchMate v2.0.0

**MyResearchMate** is a unified research platform designed for the **ANU Research School of Biology (RSB)**. It streamlines complex CRISPR editing analysis, automates PCR protocol planning, and fosters lab collaboration through a secure, cloud-integrated dashboard.

---

## 🚀 Key Modules

### 1. CRISPR Analysis Tool
A high-precision pipeline for analyzing genome editing outcomes.
- **Analysis Mode**: Process FASTQ sequencing data to quantify Indels and editing efficiency.
- **Benchmark Mode**: Validate editing results against control samples with cluster-based rescue logic.
- **Multi-Reference Support**: Assign reads to multiple genomic targets within a single sequencing run.

### 2. PCR Setup Calculator
Precision protocol planning with personalized preset management.
- **Personalized Presets**: Save your own master mix configurations and protocol templates.
- **Cloud Sync**: Access your presets from any device via secure Supabase integration.
- **Researcher Sharing**: Instantly send and receive custom PCR presets with colleagues.

---

## 🛠 Technology Stack

- **Frontend**: Angular 18+ (Premium Aesthetics)
- **Backend**: FastAPI (Python 3.11+)
- **Database**: PostgreSQL (Containerized) + Supabase (Optional Cloud Sync)
- **Containerization**: Docker & Docker Compose

---

## 🐳 Deployment Guide (Docker)

This is the recommended method for deploying MyResearchMate on a new server. It packages the database, backend, and frontend into a single manageable unit.

### 1. Prerequisites
Ensure the server has Docker and Docker Compose installed.
- [Install Docker](https://docs.docker.com/get-docker/)
- [Install Docker Compose](https://docs.docker.com/compose/install/)

### 2. Setup
1. **Clone the repository**:
   ```bash
   git clone https://github.com/JamesK0802/MyResearchMate.git
   cd MyResearchMate
   ```

2. **Configure Environment Variables**:
   Copy the example environment file and edit it:
   ```bash
   cp .env.example .env
   nano .env
   ```
   *   **Ports**: If `80` or `8000` are already in use, change `FRONTEND_PORT` or `BACKEND_PORT`.
   *   **Database**: Update `DB_PASSWORD` to a secure string.

### 3. Execution
Start the services in detached mode:
```bash
docker-compose up -d --build
```
This command will:
- Build the frontend and backend images.
- Pull the PostgreSQL image.
- Initialize a fresh database and automatically create all tables.
- Start all services.

### 4. Verification
- **Frontend**: Access via `http://your-server-ip` (or the port defined in `FRONTEND_PORT`).
- **Backend API**: Access via `http://your-server-ip/api/docs`.
- **Logs**: View real-time logs with `docker-compose logs -f`.

---

## 🔄 Maintenance & Updates

### Updating to Latest Version
```bash
git pull
docker-compose up -d --build
```

### Stopping Services
```bash
docker-compose stop  # Stops containers but preserves data
docker-compose down  # Stops and removes containers
```

### Data Persistence
Database data is stored in a persistent Docker volume named `postgres_data`. This ensures your data survives container updates or restarts.

---

## 🤖 Automated Updates (Version-based)

If you want the server to automatically update itself only when the version increases (instead of every push), you can use the provided auto-update script.

### 1. Setup the Script
1.  Make the script executable:
    ```bash
    chmod +x scripts/auto-update.sh
    ```
2.  Edit the script to set your actual repository path:
    ```bash
    nano scripts/auto-update.sh
    # Change REPO_DIR to your actual absolute path
    ```

### 2. Schedule with Cron
Set the script to run every 5 minutes (or any interval):
1.  Open crontab: `crontab -e`
2.  Add this line (update the path):
    ```cron
    */5 * * * * /bin/bash /path/to/MyResearchMate/scripts/auto-update.sh >> /path/to/MyResearchMate/auto-update.log 2>&1
    ```

### 3. Triggering an Update
To deploy a new version:
1.  Increase the version number in the `VERSION` file.
2.  Commit and push:
    ```bash
    git add VERSION
    git commit -m "Bump version to 2.0.1"
    git push origin main
    ```
The server will detect the change within 5 minutes, pull the code, and rebuild the containers automatically.

---

## 💾 Backup & Migration (Database)

To move MyResearchMate to a different server while preserving data:

### 1. Backup (Source Server)
Run this command to create a database dump:
```bash
docker exec -t mrm_db pg_dumpall -c -U james > mrm_backup.sql
```

### 2. Restore (Target Server)
1. Setup the project on the new server using the **Setup** steps above.
2. Start the containers (`docker-compose up -d`).
3. Restore the data:
```bash
cat mrm_backup.sql | docker exec -i mrm_db psql -U james
```

---

## 🛠 Troubleshooting
- **Port Conflict**: Change `FRONTEND_PORT` in `.env` if another web server (like Nginx) is already running on port 80.
- **Database Connection**: Ensure `DATABASE_URL` in `.env` uses `db:5432` as the host (this is the internal Docker network name).
- **Permissions**: If uploads fail, check write permissions for the `backend/data` directory on the host.

---
*Developed for Australian National University · Research School of Biology*
