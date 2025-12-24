import express from "express";
import { Like, Post, User } from "./database/associations.js";
import sequelize from "./database/connection.js";
const app = express();

app.use(express.json());

app.get("/health-status", (req, res) => {
  res.status(200).send({ status: true, message: "Server running" });
});

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

app.post("/api/posts/:id/likes", async (req, res) => {
  const { id } = req.params;
  const { user_id } = req.body;

  const t = await sequelize.transaction();

  try {
    await Like.create({ post_id: id, user_id }, { transaction: t });

    await Post.increment(
      { like_count: 1 },
      { where: { id: id }, transaction: t }
    );

    await t.commit();
    res.status(200).json({ success: true, message: "Liked successfully" });
  } catch (error) {
    await t.rollback();
    console.error(error);
    res
      .status(500)
      .json({ success: false, message: "Oops! something went wrong" });
  }
});

app.delete("/api/posts/:id/likes", async (req, res) => {
  const { id } = req.params;
  const { user_id } = req.body;

  const t = await sequelize.transaction();

  try {
    await Like.destroy({ where: { post_id: id, user_id } }, { transaction: t });

    await Post.increment(
      { like_count: -1 },
      { where: { id: id }, transaction: t }
    );

    await t.commit();
    res.status(200).json({ success: true, message: "Disliked successfully" });
  } catch (error) {
    await t.rollback();
    console.error(error);
    res
      .status(500)
      .json({ success: false, message: "Oops! something went wrong" });
  }
});

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
          required:true,
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

app.listen(4000, () => {
  console.log("Server running at port:4000");
});
