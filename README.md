# Encrypted File Storage

# Tech Stack

## FrontEnd

### Web UI

**HTML/CSS/[Electron]**: The frontend will primarily be written as a plain website that can be easily ported into an electron app for functionality.

## Backend

**Node.js/Express**: The backend is an express 4.21 server 
**Multer**: Used as a file upload processor library with buffering options for split uploads
**Archiver**: Used only for serving archives of folders and the entire vault to the end user.
**Helmet**: Used for middleware defense, might swap for custom implementations later.
**PostgressSQL**: PostgressSQL is the easiest to implement storage method for most of the metadata, permissions, and other file related info.
The backend will use node.js because I can't find the time to do fun stuff in life anymore.
**MinIO**: MinIO will be the basis for storing encrypted objects, chosen mostly because of the S3 compatibility.
**nginx**: There is no need for very specialised functionality beside reverse proxying and TLS, so nginx suffices as the most rational option for this project.
**Docker**: All services will be configured as Docker containers, both for environment reasons, and also as an excuse to familiarise myself more with Docker as a professional tool.

# Architecture

The full application will be deployed as a DockerCompose stack, the backend and frontend will both be compartamentalised seperately.
The project will of course use standard TLS encryption in addition to other technical solutions to security, `nginx` will need to exposre a public port for routing. Most requests other than backend traffic will be locally routed. The backend can interface `PostgressSQL` for metadata and system information and `MinIO` seperately for encrypted object storage.

I decided on implementing encryption entirely client-side, both because this is the practice I am most familiar with and also for the sake of reducing the amount of trust placed in any non local providers (in our case still our Docker containers, but as a best practice measure).

# Crypto

With the aforementioned decision of cryptographic operations being entirely client sided, plainttext will never need to be routed over the network, despite taking steps to still ensure security during the transport process. Some important definitions for this:

- `REK` - "Root Encryption Key".
  The primary encryption Key.

- `DK` - "Derived Key".
  Argon2id derived key to use with the `REK`

- `MK` - "Metadata Key".
  The secondary (and separate) key used for metadata and related information.

- `FK` - "File Key".
  The "password" used for individual encrypted objects.

- `nonce`
  Random noise as an encryption primitive.

# Walkthrough

Upon account creation the client will create a password hash using standard cryptographic procedures and then validate using `Argon2id` to generate our `DK`, the client will then generate our randomised `REK` and `MK` to be wrapped and salted using the `DK` tying to the `MK`.

For authentication, only the derivation salt will be transported before using `Argon2id` again to recreate the `DK`, this authentication will then allow for unlocking the other functionality of the app, i.e., using our derived key to unwrap the `REK` for metadata information.

The client will generate a random `FK` for each uploaded file to be used with `XChaCha20-Poly1305` for the primary object storage and the `FK` (wrapped using the `REK`) for the metadata encryption before uploading back to `MinIO`

# Threat Modeling

**A01 Broken Access Control**: Given the chosen project modeling, AC will only be a consideration for integrity and owner authentication checks. This does however mean that even though files cannot be actually decrypted due to simple misconfiguration, there is a threat of ownership and metadata can be damaged.

**A02 Security Misconfiguration**: Security misconfiguration will likely both be the most widely problematic and easy to solve threat as the compartmentalised nature of the app and the transport needs to be double checked to be in line with best security practices.

**A03 Software Supply Chain Failures**: The use of FastAPi and libsodium provide a relatively secure protection against supply chain attacks as these libraries are updated regularly, which shifts my focus to making sure the development environment is up to date and configured correctly.

**A04 Cryptographic Failures**: `XChaCha20-Poly1305` and `Argon2id` are the chosen and relatively sound solutions to cryptographic failures, as I would not like to depend on my own singular mathematical ability to make sure encryption is handled correctly.

**A05 Injection** As a web based application the vault will of course potentially be vulnerable to XSS and injection attacks, but simple checks for validating all input and security policy headers are already a long standing and well established solution to injection attacks.

**A06 Insecure Design**: The weakest link in the development chain will of course be my own incompetence, in terms of design decisions and policy, this initial design documentation and planning is the most important step in mitigating this potential, as well as following least privilege and zeo trust principles.

**A07 Authentication Failure**: This ties into the last model of design choices, strong password requirements and environment configurations for the cryptographic tools I utilise are an absolute must in addition to session regeneration to prevent authentication failures to the best of the (developers) ability.

**A08 Software and Data Integrity Failures**: This is strongly related to `A03` and the trustworthiness of the libraries and tools used in addition to regular security audits, special care was taken while choosing these dependencies to prevent simple mathematical incompetence on the part of the sole developer (me) to lead to disaster.

**A09 Security Logging and Alerting Failures**: As established this project will be built entirely upon least privilege and zero trust principles, this including regular and thorough auditing and analysis of all sensitive information.

## Rest API

All endpoints require a valid session cookie and a valid CSRF token header.

### `/api/auth`
- `GET /api/auth/csrf`: Retrive CSRF token
- `GET /api/auth/registration-status`: Checks admin account registration status
- `POST /api/auth/register`: Register endpoint for new accounts
- `POST /api/auth/login`: Standard login endpoint
- `POST /api/auth/logout`: Clears session and logsout
- `POST /api/auth/change-password`: Update an account password
- `DELETE /api/auth/account`: Wipes an account and all metadata, can be authenticated using password or an admin token

### `/api/files`
- `GET /api/files`: Lists files either `folderID` or `all`
- `POST /api/files`: File upload endpoint
- `GET /api/files/:id`: Decryption endpoint
- `GET /api/files/:id/metadata`: MinIO MD retrieval endpoint
- `GET /api/files/:id/preview`: Preview endpoint for the custom player and minipill player
- `PATCH /api/files/:id/rename`: Rename an object
- `PATCH /api/files/:id/move`: Move a file or directory
- `DELETE /api/files/:id`: File deletion
- `POST /api/files/batch/delete`: Batch deletion requiring `folderId`
- `POST /api/files/batch/move`: Batch move requiring `folderId` or a selection of object IDs
- `POST /api/files/batch/download-zip`: Archiver endpoint
- `GET /api/files/folder/:id/download`: Archiver endpoint
- `GET /api/files/export/all`: Archiver endpoint
- `GET /api/files/stats/usage`: MinIO DB sorted by MIME types

### /api/folders`
- `GET /api/folders`: Lists all folders
- `POST /api/folders`: Folder creation endpoint requiring a `parentId`
- `GET /api/folders/:id/breadcrumbs`: Folder hierachy endpoint
- `PATCH /api/folders/:id/rename`: Folder rename
- `PATCH /api/folders/:id/color`: Folder labels, overwrites
- `PATCH /api/folders/:id/move`: Folder move requiring `parentId`
- `DELETE /api/folders/:id`: Folder deletion endpoint (-r)

### `/api/admin`
- `POST /api/admin/login`: Admin signon
- `GET /api/admin/me`: Admin permission flow; TODO
- `POST /api/admin/logout`: Clears admin session
- `GET /api/admin/stats`: Retrieves basic telemetry 
- `GET /api/admin/settings`: Global registration settings
- `PATCH /api/admin/settings`: Global registration toggle
- `GET /api/admin/users`: Enumerates hashed db metrics
- `DELETE /api/admin/users/:id`: Administrative account deletion (needs to be logged seperately)

# Env


| Variable | Description | Default |
| `NODE_ENV` | Current working enviroment | `development` |
| `SESSION_SECRET` | 256-bit pseudorandom key| 64chr Hex |
| `ENCRYPTION_SALT` | HMAC-SHA256 pseudonymization | 32chr Hex |
| `DATABASE_URL` | PostgreSQL DB URI| `postgres://vault:password@postgres:5432/vault` |
| `POSTGRES_USER` | PostgreSQL username | `vault` |
| `POSTGRES_PASSWORD`| PostgreSQL password | - |
| `POSTGRES_DB` | PostgreSQL db name | `vault` |
| `MINIO_ENDPOINT` | MinIO internal hostname | `minio` |
| `MINIO_PORT` | MinIO port | `9000` |
| `MINIO_ACCESS_KEY` | MinIO username | `pinkbox_admin` |
| `MINIO_SECRET_KEY` | MinIO password | - |
| `MINIO_BUCKET` | MinIO bucket name| `encrypted-files` |
| `ADMIN_USERNAME` | Admin username | `admin` |
| `ADMIN_PASSWORD` | Admin passowrd | `admin` |

# Build

## Requirements

Docker
Node.js 18+

### Generate certs

linux

```bash
chmod +x nginx/generate-certs.sh
./nginx/generate-certs.sh
```

windows
```powershell
.\nginx\generate-certs.ps1
```

### Generate Secrets 

```bash
node setup.js
````

### Run the app

```bash
docker compose up -d --build
```
