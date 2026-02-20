import dotenv from "dotenv";
dotenv.config(); 

import fs from "fs";
import pkg from "pg";
const { Pool } = pkg;

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not defined in .env");
}

// Read PEM file safely
const caCert = fs.readFileSync("./ca.pem").toString();

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: true, // verify the certificate
    ca: caCert
  }
});
