const express = require("express");
const { MongoClient, ObjectId } = require("mongodb");
const z = require("zod");

const app = express();
const port = 8001;

const client = new MongoClient("mongodb://localhost:27017");
let db;

app.use(express.json());

const BaseAnalyticsSchema = z.object({
  source: z.string(),
  url: z.string(),
  visitor: z.string(),
  meta: z.object({}).catchall(z.any())
});

const ActionAnalyticsSchema = BaseAnalyticsSchema.extend({
  action: z.string()
});

const GoalAnalyticsSchema = BaseAnalyticsSchema.extend({
  goal: z.string()
});

app.post("/views", async (req, res) => {
  const result = BaseAnalyticsSchema.safeParse(req.body);
  if (!result.success) return res.status(400).send(result.error);

  const document = { ...result.data, createdAt: new Date() };
  const ack = await db.collection("views").insertOne(document);
  res.send({ _id: ack.insertedId, ...document });
});

app.post("/actions", async (req, res) => {
  const result = ActionAnalyticsSchema.safeParse(req.body);
  if (!result.success) return res.status(400).send(result.error);

  const document = { ...result.data, createdAt: new Date() };
  const ack = await db.collection("actions").insertOne(document);
  res.send({ _id: ack.insertedId, ...document });
});

app.post("/goals", async (req, res) => {
  const result = GoalAnalyticsSchema.safeParse(req.body);
  if (!result.success) return res.status(400).send(result.error);

  const document = { ...result.data, createdAt: new Date() };
  const ack = await db.collection("goals").insertOne(document);
  res.send({ _id: ack.insertedId, ...document });
});

app.get("/goals/:goalId/details", async (req, res) => {
  try {
    const pipeline = [
      { $match: { _id: new ObjectId(req.params.goalId) } },
      {
        $lookup: {
          from: "views",
          localField: "visitor",
          foreignField: "visitor",
          as: "associatedViews"
        }
      },
      {
        $lookup: {
          from: "actions",
          localField: "visitor",
          foreignField: "visitor",
          as: "associatedActions"
        }
      }
    ];

    const results = await db.collection("goals").aggregate(pipeline).toArray();
    if (results.length === 0) return res.status(404).send({ message: "Goal not found" });

    res.send(results[0]);
  } catch (err) {
    res.status(400).send({ message: "Invalid ID format" });
  }
});

client.connect().then(() => {
  db = client.db("analyticsDB");
  app.listen(port, () => {
    console.log(`Analytics server listening on http://localhost:${port}`);
  });
});