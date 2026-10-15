
import { test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import app from "../app.js";

test("GET /health returns 200", async () => {
  const response = await request(app).get("/health");

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { status: "ok" });
});

test("POST /api/v1/tasks rejects an empty title", async () => {
  const response = await request(app)
    .post("/api/v1/tasks")
    .send({ title: "   " });

  assert.equal(response.status, 400);
  assert.equal(
    response.body.error,
    "Title is required and must be a non-empty string"
  );
});

test("task lifecycle works correctly", async () => {
  // Create a task
  const created = await request(app)
    .post("/api/v1/tasks")
    .send({
      title: "Learn CI/CD",
      description: "Build my first pipeline",
    });

  assert.equal(created.status, 201);
  assert.ok(created.body.id);

  const taskId = created.body.id;

  // Fetch the task
  const fetched = await request(app).get(`/api/v1/tasks/${taskId}`);

  assert.equal(fetched.status, 200);
  assert.equal(fetched.body.title, "Learn CI/CD");

  // Fetch all tasks
  const allTasks = await request(app).get("/api/v1/tasks");

  assert.equal(allTasks.status, 200);
  assert.ok(allTasks.body.some((task) => task.id === taskId));

  // Update the task
  const updated = await request(app)
    .patch(`/api/v1/tasks/${taskId}`)
    .send({ completed: true });

  assert.equal(updated.status, 200);
  assert.equal(updated.body.completed, true);

  // Delete the task
  const deleted = await request(app).delete(`/api/v1/tasks/${taskId}`);

  assert.equal(deleted.status, 204);

  // Confirm the task no longer exists
  const missing = await request(app).get(`/api/v1/tasks/${taskId}`);

  assert.equal(missing.status, 404);
});
