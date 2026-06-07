# My Lab Mate v3.5.0

**My Lab Mate** is a unified research platform designed for the **ANU Research School of Biology (RSB)**. It streamlines complex CRISPR editing analysis, automates PCR protocol planning, tracks linear laboratory experiments with an immersive digital ledger, and fosters lab collaboration through a secure, cloud-integrated dashboard.

---

## 🚀 Key Modules

### 1. CRISPR Analysis Tool
A high-precision pipeline for analyzing genome editing outcomes.
- **Analysis Mode**: Process FASTQ sequencing data to quantify Indels and editing efficiency.
- **Benchmark Mode**: Validate editing results against control samples with cluster-based rescue logic.
- **Multi-Reference Support**: Assign reads to multiple genomic targets within a single sequencing run.
- **Result Curation Mode**: Instantly subset analysis results by visually excluding irrelevant sequencing files, off-target genes, or specific annotation groups. All editing efficiencies and summary charts instantly recalculate on the fly based only on the included dataset. Curated views can be saved as pristine, standalone records to the cloud or exported directly to Excel for publication reporting.
- **Gene-Level Collapsing Demultiplexing (New in v3.3)**: Advanced read-to-reference assignment supporting multi-gRNA/multi-target CRISPR screens.
  - *Evidence Collapsing*: Individual target windows within the same gene are grouped together as evidence rather than competing classes, avoiding false-positive ambiguous reads.
  - *Algorithm*: Scores each read against all target windows, collapses scores by taking the maximum for each gene/reference (`gene_score = max(target_window_scores)`), and applies a user-specified margin check between the top-1 and top-2 gene-level scores to ensure high-confidence assignment.
  - *Downstream Robustness*: Once assigned to a parent gene/reference, downstream editing and Indel analysis are performed independently for all target windows within that gene.
- **CPU-Multiprocess Parallel Engine (New in v3.3.1)**: Overhauled background execution to analyze batches of 40-50+ FASTQ files concurrently. Using a process-isolated `ProcessPoolExecutor`, files are processed in parallel across all available CPU cores (scaling up to 16 cores). This provides massive speedups (up to 16x faster) on high-spec multi-core servers, with thread-safe file progress reporting.

### 2. PCR Setup Calculator
Precision protocol planning with personalized preset management.
- **Personalized Presets**: Save your own master mix configurations and protocol templates.
- **Cloud Sync**: Access your presets from any device via secure Supabase integration.
- **Researcher Sharing**: Instantly send and receive custom PCR presets with colleagues.

### 3. Lab Notebook & Experiments
A robust workspace for tracking real-time linear protocol flows.
- **Active Workspaces**: Initialize experiments from custom presets or ad-hoc templates with visual, multi-line protocol briefs.
- **Compact Horizontal Flow**: Track linear steps horizontally in a clean scroller with quick inline comments and status progression.
- **Complete All Sequence**: Mark all sequence steps complete instantly with a single button.
- **Detailed Step Ledger**: Immersion panel showing step descriptions, completion timestamps, custom logs, and evidence photos.
- **Lightbox Image Viewer**: Click on any uploaded result image to zoom and preview in a high-fidelity lightbox overlay.
- **Default Template**: Ships with a comprehensive **Plant CRISPR Editing Full Workflow** preset (26 steps) covering target selection, gRNA design, cloning, E. coli transformation, miniprep, Agrobacterium delivery, plant infection, DNA extraction, sequencing, and CRISPR analysis.

### 4. Interactive Success Rate Archiving
Grade and catalog completed protocols with clean, high-utility UI.
- **Gradient Star Rating**: Clickable 1-5 star success rates representing a smooth spectrum from Low (Red) to High (Green).
- **Archive Ledger**: Dedicated completed repository displaying past experiments in the exact same premium card and scroller UI as active workspaces for complete consistency.
- **Search & Filter**: Sift through past runs by Success Rate, Work Type, tags, samples, and archive date.
- **Outcome Comments**: Post-completion discussion threads on archived experiments for scientific review and notes.

### 5. Collaborative Sharing (New in v3.2)
Share research workspaces with labs and individual researchers.
- **Lab Sharing**: Share active experiments and archived records with entire research labs. All lab members gain read access to view steps, images, and comments.
- **Individual Sharing**: Share directly with specific researchers by name or email, ideal for small 1–2 person collaborations.
- **Revocable Access**: Toggle lab and researcher access on/off at any time via a clean checklist modal.
- **Shared Experiments Tab**: Dedicated view showing all experiments shared with you, clearly badged with sharer identity.
- **Visual Sharing Badges**: Instant CSS-based hover tooltips on cards and modals listing who has access, with premium glassmorphic styling.
- **Template Sharing**: Send workflow preset templates directly to another researcher's inbox for them to accept or reject.

### 6. Lab Team Archive
Store lab-level records, reference files, links, and discussion threads in one shared archive.
- **Record, Table, and File Explorer Views**: Switch between compact record cards, resizable data-table columns, and a Finder-style file browser.
- **Attachment Management**: Upload new files, link existing archive files, download attachments, and open linked records directly in the file explorer.
- **Readable Long Content Handling**: Long URLs, filenames, summaries, and descriptions are visually truncated in list/table previews while preserving full input values and full detail views.
- **Collapsible Folder Sidebar**: Hide or restore the file explorer folder tree to prioritize the main file list on wide screens.
- **Compact Workspace Layout**: Lab archive, My Data, Lab Notes, and Facility Booking pages use tighter headers with preserved desktop side margins for more usable working space.

---

## 🛠 Technology Stack

- **Frontend**: Angular 21 (Premium Minimalist Aesthetics, Pure HSL CSS Design System)
- **Backend**: FastAPI (Python 3.11+)
- **Database**: PostgreSQL (Containerized) + Supabase (Optional Cloud Sync)
- **Containerization**: Docker & Docker Compose

---

## 🐳 Deployment Guide (Docker)

This is the recommended method for deploying My Lab Mate on a new server. It packages the database, backend, and frontend into a single manageable unit.

### 1. Prerequisites
Ensure the server has Docker and Docker Compose installed.
- [Install Docker](https://docs.docker.com/get-docker/)
- [Install Docker Compose](https://docs.docker.com/compose/install/)

### 2. Setup
1. **Clone the repository**:
   ```bash
   git clone https://github.com/JamesK0802/MyLabMate.git
   cd MyLabMate
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
Database data is stored in a persistent Docker volume named `postgres_data`, and laboratory document files are persisted on the host disk under `data/` directory. This ensures all your research materials survive container updates, restarts, or unexpected host shutdowns.

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
     */5 * * * * /bin/bash /path/to/MyLabMate/scripts/auto-update.sh >> /path/to/MyLabMate/auto-update.log 2>&1
     ```

### 3. Triggering an Update
To deploy a new version:
1.  Increase the version number in the `VERSION` file.
2.  Commit and push:
     ```bash
     git add VERSION
     git commit -m "Bump version to 3.3.1"
     git push origin main
     ```
The server will detect the change within 5 minutes, pull the code, and rebuild the containers automatically.

---

## 💾 Backup & Migration (Database)

To move My Lab Mate to a different server while preserving data:

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

## 📋 Changelog

### v3.5.0
- **Nicole Booking Gimmick Removal**: Completely cleaned up the codebase by removing the gimmick "Nicole Booking System" (`/booking/nicole` and `/api/nicole-gimmick`) while keeping the core ANU RSB Facility Booking system fully intact and operational.
- **Facility Booking Mobile Layout**: Resolved the broken layout of the facility booking Yearly Overview on mobile by making the table horizontally scrollable, pinning the `SPOT` column sticky on the left with a solid background and subtle boundary shadow, and stacking the controls vertically.
- **Lab Team Archive**: Added a lab-level archive with records, links, file attachments, discussion threads, resizable table columns, compact previews, a detail modal, and a Finder-style file explorer with a collapsible folder sidebar.
- **File Explorer & Archive Enhancements**: Fixed upload failure issues, simplified action columns with clean SVG buttons, removed redundant search bars, and resolved tree node spacing in the folder explorer.
- **Sidebar Drag Resizing**: Added dynamic drag resizing for the left sidebar explorer, allowing researchers to adjust side panel width seamlessly.
- **Data & Path Persistence**: Linked backend `fs/move` events to automatically update references in all records and samples databases, and configured container data directories to write directly to host bind mounts for robust persistence.
- **Parallel Workers Progress Overlay**: Engineered visual multi-thread progress bars inside the loading overlay on the CRISPR analysis page, displaying real-time processing statistics for each FASTQ worker process.
- **Premium SVG Icon Overhaul**: Replaced outdated, low-fidelity browser-default emojis with beautifully crafted custom vector SVG icons across tab views (📋, 🗺️, 📆), outcome sharing modals, edit ledgers, and action buttons.
- **Unified Results Toolbar**: Standardized and aligned margins, padding, heights, and border consistency for all action buttons (New Analysis, Save to My Data, Export Excel) inside the result viewer.
- **Dashboard Stat Widgets**: Restructured the monthly booking calendar overview with sleek, responsive dashboard stat indicators (Total, Booked, Available) utilizing custom themed palettes and matching SVGs.


### v3.4.0
- **X-Padding Architecture**: Redesigned the CRISPR read classification and analysis pipeline. Terminal unobserved sequences (due to short reads) are now explicitly padded with `X` and treated as unobserved rather than being erroneously classified as biological deletions or triggering false-positive reference restorations.
- **X-Aware Alignment**: Integrated terminal-aware `SequenceMatcher` logic to properly classify truncated read boundaries as `unobserved` tokens, ensuring perfectly accurate Indel size counting.
- **Variable-Length Read Extraction**: `classifier.py` now extracts sequences at precise coordinate offsets mapped by either gRNA alignment or anchor fallbacks, preserving any inserted bases within the target window.

### v3.3.1
- **CPU-Multiprocess Parallel Engine**: Overhauled uvicorn background task dispatcher to leverage the CPU cores of high-spec servers via process-isolated `ProcessPoolExecutor`. Batches of 40-50+ FASTQ files are analyzed concurrently, reducing total execution times up to 16x on multi-core systems.
- **Thread-Safe Batched Progress Reporting**: Engineered a centralized progress-tracker that aggregates async file-level completion events to deliver a stable, reliable progress bar in the Angular UI, preventing flickering or visual resets.
- **Fault-Tolerant Batch Analysis**: Implemented isolated exception boundaries on worker processes. Format errors or corrupted sequence reads in a single file will be caught, logged, and isolated, allowing the rest of the batch to run and return results successfully.

### v3.3.0
- **CRISPR Gene-Level Collapsed Assignment**: Redesigned read demultiplexing to compute maximum evidence scores across all target windows belonging to a gene (`gene_score = max(target_window_scores)`), preventing target-vs-target competition from producing false-positive ambiguous reads in multi-gRNA and multi-target CRISPR screens.
- **Gene-Level Margin Check**: Restructured margin calculation to run purely on collapsed gene scores, validating `top1_gene_score - top2_gene_score >= margin_threshold` prior to final reference assignment.
- **Dynamic Frontend Version Syncing**: Refactored the `ContactPageComponent` system version display to bind directly to the dynamically patched Angular `environment.version` instead of a hardcoded version string, ensuring absolute alignment with the root `VERSION` file.

### v3.2.0
- **Collaborative Sharing**: Lab-level and individual researcher sharing for active experiments and archives with revocable access control.
- **Shared Experiments Tab**: Dedicated view for experiments shared with you, with sharer identity badges.
- **Visual Sharing Badges**: Premium CSS-based hover tooltips on cards/modals showing sharing recipients.
- **Template Sharing**: Send and receive workflow preset templates between researchers.
- **Outcome Comments**: Post-completion discussion threads on archived experiments.
- **Global Outline Buttons**: Unified `.app-btn-outline`, `.app-btn-success-outline`, `.app-btn-danger-outline` design system classes.
- **Plant CRISPR Default Template**: Comprehensive 26-step Plant CRISPR Editing Full Workflow as the default preset.
- **UI Fixes**: NgZone wrapping for Supabase auth callbacks, isolated API error handling to prevent empty pages, auth reload race condition fix.

### v3.0.0
- Lab Notebook & Experiments module with active workspaces, horizontal step flow, and detailed step ledger.
- Interactive success rate archiving with gradient star ratings.
- PCR Setup Calculator with personalized presets and cloud sync.

---
*Developed for Australian National University · Research School of Biology*
