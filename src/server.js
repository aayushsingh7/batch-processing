import express from "express";
import { Like, Post, User } from "./database/associations.js";
import sequelize from "./config/mysql.js";
import redis from "./config/redis.js";
import myQueue from "./queues/trailQueue.js";
const app = express();

app.use(express.json());

app.get("/health-status", (req, res) => {
  res.status(200).send({ status: true, message: "Server running" });
});

// const generateToken = () => crypto.randomBytes(32).toString('hex');

// const setupCSRF = async (req, res, next) => {
//     const userId = req.headers['user-id']; // In real apps, get this from your Auth/JWT
//     if (!userId) return res.status(401).send("Unauthorized");

//     const token = generateToken();
//     await client.set(`csrf:${userId}`, token, { EX: 3600 });
//     res.setHeader('X-CSRF-Token', token);
//     next();
// };

// const verifyCSRF = async (req, res, next) => {
//     const userId = req.headers['user-id'];
//     const clientToken = req.headers['x-csrf-token'];

//     if (!clientToken) {
//         return res.status(403).send("CSRF token missing");
//     }

//     const serverToken = await client.get(`csrf:${userId}`);

//     if (clientToken !== serverToken) {
//         return res.status(403).send("Invalid CSRF token");
//     }

//     next();
// };

app.post("/api/users", async (req, res) => {
  const { name, username, email } = req.body;
  try {
    const newUser = await User.create({ name, username, email });
    res.status(200).send({
      success: true,
      message: "User created successfully",
      user: newUser,
    });
  } catch (error) {
    console.error(error.original.code);
    if (error.original?.code === "ER_DUP_ENTRY") {
      return res
        .status(409)
        .send({ status: false, message: "User already exists" });
    }
    res
      .status(500)
      .send({ success: false, message: "Oops! something went wrong" });
  }
});

app.post("/api/posts", async (req, res) => {
  try {
    const { title, description, posted_by } = req.body;
    const newPost = await Post.create({ title, description, posted_by });
    res.status(200).send({
      success: true,
      message: "Post created successfully",
      post: newPost,
    });
  } catch (error) {
    console.error(error);
    res
      .status(500)
      .send({ success: true, message: "Oops! something went wrong" });
  }
});

// app.post("/api/posts/:id/likes", async (req, res) => {
//   const { id } = req.params;
//   const { user_id } = req.body;

//   const t = await sequelize.transaction();

//   try {
//     await Like.create({ post_id: id, user_id }, { transaction: t });

//     await Post.increment(
//       { like_count: 1 },
//       { where: { id: id }, transaction: t }
//     );

//     await t.commit();
//     res.status(200).json({ success: true, message: "Liked successfully" });
//   } catch (error) {
//     await t.rollback();
//     console.error(error);
//     res
//       .status(500)
//       .json({ success: false, message: "Oops! something went wrong" });
//   }
// });

app.post("/api/posts/:id/likes", async (req, res) => {
  const { id } = req.params;
  const { user_id } = req.body;
  try {
    const key = `posts:${id}:likes`;
    await redis.sadd("post_with_pending_likes", id);
    await redis.sadd(key, user_id);

    if ((await redis.scard(key)) > 100) {
      await myQueue.add(
        "bulk-likes",
        { post_id: id },
        {
          jobId: `bulk:${id}`,
          attempts: 3, 
          backoff: {
            type: "exponential", 
            delay: 5000, 
          },
        }
      );
    }
    res.status(200).send({ success: true, message: "Post liked" });
  } catch (error) {
    console.error(error);
    res
      .status(500)
      .send({ status: false, message: "Oops! something went wrong" });
  }
});

app.delete("/api/posts/:id/likes", async (req, res) => {
  const { id } = req.params;
  const { user_id } = req.body;
  try {
    const likeKey = `posts:${id}:likes`;
    if (await redis.sismember(likeKey, user_id)) {
      // user has liked this post before and the like is not sync to db yet [so simple remove the like].
      await redis.srem(likeKey, user_id);
    } else {
      // user like has already been synced to db [remove it from database and decrement count]
      const dislikeKey = `posts:${id}:dislikes`;
      await redis.sadd(dislikeKey, user_id);
      await redis.sadd("post_with_pending_likes", id);
    }
    res.status(200).send({ success: true, message: "Post liked" });
  } catch (error) {
    console.error(error);
    res
      .status(500)
      .send({ status: false, message: "Oops! something went wrong" });
  }
});

// app.delete("/api/posts/:id/likes", async (req, res) => {
//   const { id } = req.params;
//   const { user_id } = req.body;

//   const t = await sequelize.transaction();

//   try {
//     await Like.destroy({ where: { post_id: id, user_id } }, { transaction: t });

//     await Post.increment(
//       { like_count: -1 },
//       { where: { id: id }, transaction: t }
//     );

//     await t.commit();
//     res.status(200).json({ success: true, message: "Disliked successfully" });
//   } catch (error) {
//     await t.rollback();
//     console.error(error);
//     res
//       .status(500)
//       .json({ success: false, message: "Oops! something went wrong" });
//   }
// });

app.get("/api/posts/:id/likes", async (req, res) => {
  const { id } = req.params;
  try {
    const likedUsers = await Post.findByPk(id, {
      attributes: [],
      include: [
        {
          model: User,
          as: "liked_by_users",
          attributes: ["id", "username", "profile_pic"],
          through: { attributes: [] },
        },
      ],
    });

    res.status(200).send({
      success: true,
      message: "Users fetched successfully",
      data: likedUsers.liked_by_users,
    });
  } catch (error) {
    console.error(error);
    res
      .status(500)
      .send({ success: false, message: "Oops! something went wrong" });
  }
});

app.get("/api/users/:id/likes", async (req, res) => {
  const { id } = req.params;
  try {
    const posts = await Post.findAll({
      attributes: ["id", "title", "description"],
      include: [
        {
          model: User,
          as: "liked_by_users",
          attributes: [],
          required: true,
          through: {
            where: { user_id: id },
            attributes: [],
          },
        },
        {
          model: User,
          as: "creator",
          attributes: ["id", "username", "profile_pic"],
        },
      ],
    });

    res.status(200).send({
      success: true,
      message: "Users fetched successfully",
      posts,
    });
  } catch (error) {
    console.error(error);
    res
      .status(500)
      .send({ success: false, message: "Oops! something went wrong" });
  }
});

app.get("/api/posts/trending", async (req, res) => {
  const { limit } = req.query;
  try {
    let trending = [];
    const key = `trending:${new Date().toISOString().slice(0, 10)}`;
    const cache = await redis.get(key);
    if (cache) {
      console.log("cache hit!");
      trending = JSON.parse(cache);
    } else {
      console.log("cache miss!");
      trending = await Post.findAll({
        attributes: ["id", "title", "description", "like_count", "created_at"],
        include: [
          {
            model: User,
            as: "creator",
            attributes: ["profile_pic", "id", "username"],
          },
        ],
        order: [["like_count", "DESC"]],
        limit: Number(limit) || 10,
      });

      const now = new Date();
      const secondsUntilMidnight = Math.floor(
        (new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1) - now) /
          1000
      );
      await redis.set(
        key,
        JSON.stringify(trending),
        "EX",
        secondsUntilMidnight
      );
    }
    res.status(200).send({
      success: true,
      message: "Posts fetched successfully",
      posts: trending,
    });
  } catch (error) {
    console.error(error);
    res
      .status(500)
      .send({ success: false, message: "Oops! something went wrong" });
  }
});

app.listen(4000, () => {
  console.log("Server running at port:4000");
});
