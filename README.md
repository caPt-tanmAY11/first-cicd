# First CI/CD — Express REST API

A small Express.js REST API built to learn and demonstrate an end-to-end CI/CD pipeline. The application is containerized with Docker, its images are published to GitHub Container Registry (GHCR), and successful pushes to `main` trigger deployment to AWS EC2 through AWS Systems Manager.

**Live health check:** [http://3.111.37.223/health](http://3.111.37.223/health)  
> The URL uses the EC2 instance's current public IPv4 address. It may change if the instance is stopped and started unless an Elastic IP is configured.

## Tech stack

| Technology | How it is used |
|---|---|
| **Node.js 24** | JavaScript runtime for the API and Docker image. |
| **Express.js** | HTTP server, routing, JSON request parsing, and REST endpoints. |
| **ES modules** | Uses `import` / `export` rather than CommonJS `require()`. |
| **Node.js Test Runner** | Runs automated tests with `node --test`. |
| **Supertest** | Tests Express endpoints without manually starting a server. |
| **Docker** | Packages the application and production dependencies into an image. |
| **GitHub Actions** | Runs tests, builds and publishes the image, then coordinates deployment. |
| **GitHub Container Registry (GHCR)** | Stores versioned Docker images. |
| **AWS EC2 (Ubuntu)** | Hosts Docker and runs the application container. |
| **AWS IAM + GitHub OIDC** | Grants the GitHub Actions workflow temporary, restricted AWS credentials. |
| **AWS Systems Manager (SSM)** | Runs deployment commands on EC2 and reports their status without requiring inbound SSH from GitHub-hosted runners. |

## Application features

- Health-check endpoint for deployment verification.
- Task CRUD endpoints: create, list, retrieve, update, and delete tasks.
- Input validation and appropriate HTTP status codes.
- Automated API tests.
- In-memory task storage to keep this first version simple.

> **Persistence note:** Tasks are stored in memory, not in a database. They are lost whenever the Node.js process or container restarts. MongoDB is intentionally not included in this first version.

## API endpoints

Base URL locally: `http://localhost:3000`

| Method | Endpoint | Description | Typical success status |
|---|---|---|---:|
| `GET` | `/health` | Checks whether the API responds. | `200 OK` |
| `GET` | `/api/v1/tasks` | Returns all tasks. | `200 OK` |
| `GET` | `/api/v1/tasks/:id` | Returns a task by ID. | `200 OK` |
| `POST` | `/api/v1/tasks` | Creates a task. | `201 Created` |
| `PATCH` | `/api/v1/tasks/:id` | Updates supplied task fields. | `200 OK` |
| `DELETE` | `/api/v1/tasks/:id` | Deletes a task. | `204 No Content` |

### Example requests

Check the health endpoint:

```bash
curl -i http://localhost:3000/health
```

Create a task:

```bash
curl -i -X POST http://localhost:3000/api/v1/tasks \
  -H "Content-Type: application/json" \
  -d '{"title":"Learn CI/CD","description":"Build my first pipeline"}'
```

List tasks:

```bash
curl -i http://localhost:3000/api/v1/tasks
```

Fetch one task (replace `TASK_ID` with the returned UUID):

```bash
curl -i http://localhost:3000/api/v1/tasks/TASK_ID
```

Mark a task as completed:

```bash
curl -i -X PATCH http://localhost:3000/api/v1/tasks/TASK_ID \
  -H "Content-Type: application/json" \
  -d '{"completed":true}'
```

Delete a task:

```bash
curl -i -X DELETE http://localhost:3000/api/v1/tasks/TASK_ID
```

## Run locally

### Prerequisites

- Node.js 24 or a compatible Node.js version.
- npm (bundled with Node.js).
- Docker, if you want to build and run the container locally.

### 1. Clone the repository

```bash
git clone https://github.com/caPt-tanmAY11/first-cicd.git
cd first-cicd
```

### 2. Install dependencies

```bash
npm ci
```

`npm ci` installs the dependency versions recorded in `package-lock.json`. It is also the installation command used by CI.

### 3. Start the API

```bash
npm start
```

The server listens on port `3000` by default. You can override the port with the `PORT` environment variable, for example:

```bash
PORT=4000 npm start
```

In another terminal, verify it:

```bash
curl -i http://localhost:3000/health
```

Expected response body:

```json
{"status":"ok"}
```

### 4. Run automated tests

```bash
npm test
```

The tests use Node.js's built-in test runner and Supertest. They cover the health endpoint, invalid task input, and a task's create/read/update/delete lifecycle.

## Run with Docker

Build the image from the repository root:

```bash
docker build -t first-cicd:local .
```

Start a container and map host port `3000` to container port `3000`:

```bash
docker run -d --name first-cicd-test -p 3000:3000 first-cicd:local
```

Test it:

```bash
curl -i http://localhost:3000/health
curl -i http://localhost:3000/api/v1/tasks
```

View logs and stop/remove the test container:

```bash
docker logs first-cicd-test
docker rm -f first-cicd-test
```

The Docker image installs production dependencies only and runs the application as the non-root `node` user. `.dockerignore` excludes local dependencies, Git data, workflow files, and environment files from the build context.

## CI/CD workflow

The workflow is defined in `.github/workflows/ci.yml`.

```text
Push to main
    │
    ▼
Run automated tests
    │ (must succeed)
    ▼
Build Docker image
    │
    ▼
Push image to GHCR
    ├── <commit-sha>
    └── latest
    │
    ▼
Assume AWS role using GitHub OIDC
    │
    ▼
Send deployment command through AWS Systems Manager
    │
    ▼
EC2 pulls the commit-SHA image
    │
    ▼
Replace the running container and check /health
```

### CI: test the application

The `test` job runs on pushes to `main` and pull requests targeting `main`. It checks out the source, sets up Node.js, installs dependencies with `npm ci`, and runs `npm test`.

### Build and publish the image

The `build-and-push` job depends on successful tests and runs only for pushes to `main`. It authenticates to GHCR with the workflow-provided `GITHUB_TOKEN` and `packages: write` permission, then publishes two tags:

- **Commit SHA:** uniquely identifies the source revision deployed by that workflow run.
- **`latest`:** convenient tag for the most recently published image.

The deployment uses the commit-SHA tag rather than relying on the moving `latest` tag.

### CD: deploy to EC2 through Systems Manager

The `deploy` job assumes an AWS IAM role using GitHub OIDC. It then uses Systems Manager Run Command to execute a deployment script on the target EC2 instance. The script pulls the commit-SHA image from GHCR, replaces the `first-cicd` container, maps EC2 port `80` to container port `3000`, and checks the local `/health` endpoint. The workflow waits for the Systems Manager command result and fails if the command reports an error.

The deployment script attempts to restore the previous image if the replacement fails to start or fails its health check. This is a basic rollback attempt, not a zero-downtime deployment.

A separate manually triggered workflow, `.github/workflows/aws-oidc-test.yml`, was used to verify that GitHub Actions could assume the AWS role. It runs `aws sts get-caller-identity` and is intended as a diagnostic workflow.

## AWS infrastructure

The deployment uses the following AWS components:

- **EC2:** Ubuntu instance that runs Docker and the Express container.
- **Security group:** Allows inbound HTTP on port `80`. Inbound SSH was removed after Session Manager access was verified.
- **EC2 instance role:** `first-cicd-ec2-ssm-role`, with `AmazonSSMManagedInstanceCore`, allows the SSM Agent to communicate with Systems Manager.
- **Systems Manager:** Session Manager provides browser-based administration; Run Command executes deployment scripts remotely.
- **GitHub OIDC provider and deployment IAM role:** GitHub Actions obtains temporary AWS credentials instead of using permanent AWS access keys. The trust policy is restricted to the repository and `main` branch; the role has permissions to send the SSM command and inspect its result.
- **GHCR read access on EC2:** Docker on the instance is authenticated to the private package so the deployment can pull images.

## Required configuration and secrets

The workflow expects these AWS-side resources to be configured before deployment:

1. An EC2 instance with Docker installed and the SSM Agent online.
2. An EC2 IAM instance profile with `AmazonSSMManagedInstanceCore`.
3. A GitHub OIDC identity provider in IAM and a deployment role with a restricted trust policy.
4. A permissions policy allowing `ssm:SendCommand` to the intended instance and `ssm:GetCommandInvocation` for status checks.
5. GHCR read access configured for Docker on EC2.
6. A security group allowing inbound TCP port `80` for public HTTP access.

The current deployment workflow uses OIDC; it does not require permanent AWS access keys or SSH private keys in GitHub repository secrets. The GHCR PAT used for pulling the private image is a separate credential from AWS IAM credentials.

## Troubleshooting

| Symptom | What to check |
|---|---|
| CI tests fail | Run `npm test` locally and inspect the failing assertion. |
| `docker build` fails | Check the Dockerfile, `package-lock.json`, and build output. |
| GHCR push fails | Check the job's `packages: write` permission and the GHCR login step. |
| SSM instance is not online | Check that the SSM Agent is running, the EC2 role is attached, and the instance can reach Systems Manager endpoints. |
| SSM command returns `AccessDenied` | Review the GitHub OIDC trust policy, assumed role, and SSM permissions. |
| `docker pull` reports `denied` | Check the GHCR package permissions and the read-only package token configured on EC2. |
| Deployment says `invalid reference format` | Check that `build-and-push` exposes `image_name` as a job output and that `deploy` receives it. |
| Public `/health` request times out | Check the EC2 public IP, security-group HTTP rule, container status, and `80:3000` port mapping. |
| SSH no longer connects | Inbound SSH was intentionally removed; use Session Manager. |

## Current limitations and next improvements

- **In-memory storage:** task data is lost when the application process/container restarts. Add MongoDB or another persistent database for durable storage.
- **HTTP only:** the current public endpoint uses HTTP. Add HTTPS using a domain name and an appropriate TLS/reverse-proxy setup before handling sensitive traffic.
- **Public IP may change:** the instance's automatically assigned public IPv4 address can change after a stop/start. Consider an Elastic IP or a domain-based setup if a stable endpoint is required.
- **Deployment downtime:** the current deployment removes the previous container before the replacement is verified. Consider blue/green deployment or another strategy for minimal downtime.
- **GHCR token management:** the PAT configured for image pulls is separate from AWS OIDC. Use least privilege, protect it on the EC2 host, rotate it before expiry, and consider a more maintainable secret-management approach for a longer-lived deployment.
- **Cost awareness:** EC2, public IPv4, storage, and related resources can incur charges. Monitor AWS billing and stop or remove resources when they are not needed.

## Repository layout

```text
.
├── .github/
│   └── workflows/
│       ├── ci.yml
│       └── aws-oidc-test.yml
├── test/
│   └── app.test.js
├── app.js
├── server.js
├── Dockerfile
├── .dockerignore
├── package.json
├── package-lock.json
└── README.md
```

---

Built as a hands-on project to learn Express.js, Docker, GitHub Actions, container registries, AWS IAM/OIDC, EC2, and Systems Manager-based deployments.
