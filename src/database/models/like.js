import { DataTypes, Sequelize } from "sequelize";
import sequelize from "../../config/mysql.js";

const Like = sequelize.define(
  "like",
  {
    id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      autoIncrement: true,
      primaryKey: true,
    },
    post_id: {
      type: DataTypes.INTEGER,
      references: {
        model: "posts",
        key: "id",
      },
      allowNull: false,
    },
    user_id: {
      type: DataTypes.INTEGER,
      references: {
        model: "users",
        key: "id",
      },
      allowNull: false,
    },
  },
  {
    underscored: true,
    timestamps: true,
    indexes: [{ unique: true, fields: ["post_id", "user_id"] }],
  }
);

export default Like;
