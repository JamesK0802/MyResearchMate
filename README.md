# MyResearchMate v2.0.0

**MyResearchMate** is a unified research platform designed for the **ANU Research School of Biology (RSB)**. It streamlines complex CRISPR editing analysis, automates PCR protocol planning, and fosters lab collaboration through a secure, cloud-integrated dashboard.

## 🚀 Key Modules

### 1. CRISPR Analysis Tool
A high-precision pipeline for analyzing genome editing outcomes.
- **Analysis Mode**: Process FASTQ sequencing data to quantify Indels and editing efficiency.
- **Benchmark Mode**: Validate editing results against control samples with cluster-based rescue logic.
- **Multi-Reference Support**: Assign reads to multiple genomic targets within a single sequencing run.

### 2. PCR Setup Calculator (New in v2.0)
Precision protocol planning with personalized preset management.
- **Personalized Presets**: Save your own master mix configurations and protocol templates.
- **Cloud Sync**: Access your presets from any device via secure Supabase integration.
- **Researcher Sharing**: Instantly send and receive custom PCR presets with colleagues within the RSB network.
- **Export Ready**: Generate preparation tables and PDF protocols for the lab bench.

### 3. Lab & Group Management (New in v2.0)
The social and collaborative backbone of the platform.
- **Lab Discovery**: Browse and join research groups within the RSB community.
- **Member Management**: Lab owners can approve join requests and manage group permissions.
- **Data Sharing**: Share analysis results and presets securely with specific lab groups.

## 🛠 Technology Stack

- **Frontend**: Angular 18 with Vanilla CSS (Premium Aethetics)
- **Backend**: FastAPI (Python 3.11+)
- **Database**: Supabase (PostgreSQL)
- **Auth**: JWT-based secure authentication with University email validation.

## 📦 Installation & Setup

### Backend
1. `cd crispr_backend`
2. `python -m venv venv && source venv/bin/activate`
3. `pip install -r requirements.txt`
4. Configure `.env` with your Supabase credentials.
5. `python api.py`

### Frontend
1. `cd crispr-frontend`
2. `npm install`
3. `ng serve`

---
*Developed for Australian National University · Research School of Biology*
