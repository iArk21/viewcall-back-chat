import mongoose from "mongoose";

export async function connectDB(uri) {
  try {
    await mongoose.connect(uri, {
      // opciones modernas (mongoose 7 ignora warnings)
    });
    console.log("MongoDB conectado");
  } catch (err) {
    console.error("Error conectando a MongoDB:", err);
    process.exit(1);
  }
}
