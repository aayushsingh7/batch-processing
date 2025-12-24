import sequelize from "./connection.js";
import Like from "./models/like.js";
import Post from "./models/post.js";
import User from "./models/user.js";

User.hasMany(Post, { foreignKey: "posted_by", as: "posts" });
Post.belongsTo(User, { foreignKey: "posted_by", as: "creator" });

Post.hasMany(Like, { foreignKey: "post_id", as: "likes" });
Like.belongsTo(Post, { foreignKey: "post_id" });

User.hasMany(Like, { foreignKey: "user_id", as: "user_likes" });
Like.belongsTo(User, { foreignKey: "user_id" });

User.belongsToMany(Post, {
  through: Like,
  foreignKey: "user_id",
  otherKey: "post_id",
  as: "liked_posts",
});

Post.belongsToMany(User, {
  through: Like,
  foreignKey: "post_id",
  otherKey: "user_id",
  as: "liked_by_users",
});

sequelize
  .sync()
  .then((result) => {
    console.log(result);
  })
  .catch((error) => {
    console.log(error);
  });

// Export the models and the connection
export { User, Post, Like };
