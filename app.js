
import express from "express";
import { randomUUID } from "node:crypto";

const app = express();

app.use(express.json());

const tasks = [];

app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok" });
});

app.get("/api/v1/tasks", (req, res) => {
  res.status(200).json(tasks);
});

app.post("/api/v1/tasks", (req, res) => {
  const { title, description = "" } = req.body;

  if (typeof title !== "string" || !title.trim()) {
    return res.status(400).json({
      error: "Title is required and must be a non-empty string",
    });
  }

  if (typeof description !== "string") {
    return res.status(400).json({
      error: "Description must be a string",
    });
  }

  const task = {
    id: randomUUID(),
    title: title.trim(),
    description: description.trim(),
    completed: false,
  };

  tasks.push(task);

  res.status(201).json(task);
});

app.get("/api/v1/tasks/:id", (req, res) => {
  const task = tasks.find((task) => task.id === req.params.id);

  if (!task) {
    return res.status(404).json({ error: "Task not found" });
  }

  res.status(200).json(task);
});

app.patch("/api/v1/tasks/:id", (req, res) => {
  const task = tasks.find((task) => task.id === req.params.id);

  if (!task) {
    return res.status(404).json({ error: "Task not found" });
  }

  const updates = req.body;
  const allowedFields = ["title", "description", "completed"];

  if (
    !updates ||
    typeof updates !== "object" ||
    Array.isArray(updates) ||
    Object.keys(updates).length === 0 ||
    Object.keys(updates).some((key) => !allowedFields.includes(key))
  ) {
    return res.status(400).json({ error: "Invalid update fields" });
  }

  if (
    "title" in updates &&
    (typeof updates.title !== "string" || !updates.title.trim())
  ) {
    return res.status(400).json({ error: "Title must be a non-empty string" });
  }

  if ("description" in updates && typeof updates.description !== "string") {
    return res.status(400).json({ error: "Description must be a string" });
  }

  if ("completed" in updates && typeof updates.completed !== "boolean") {
    return res.status(400).json({ error: "Completed must be a boolean" });
  }

  if ("title" in updates) task.title = updates.title.trim();
  if ("description" in updates) task.description = updates.description.trim();
  if ("completed" in updates) task.completed = updates.completed;

  res.status(200).json(task);
});

app.delete("/api/v1/tasks/:id", (req, res) => {
  const taskIndex = tasks.findIndex((task) => task.id === req.params.id);

  if (taskIndex === -1) {
    return res.status(404).json({ error: "Task not found" });
  }

  tasks.splice(taskIndex, 1);

  res.status(204).send();
});

export default app;
