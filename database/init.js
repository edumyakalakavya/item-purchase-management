const path = require('path');
const mysql = require(path.join(__dirname, '../backend/node_modules/mysql2/promise'));
const fs = require('fs');
const dotenv = require(path.join(__dirname, '../backend/node_modules/dotenv'));

dotenv.config({ path: path.join(__dirname, '../backend/.env') });

async function initDB() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD,
    multipleStatements: true
  });

  console.log('Connected to MySQL. Executing schema.sql...');
  const schemaSql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8');
  await connection.query(schemaSql);
  console.log('schema.sql executed successfully.');

  console.log('Executing seed.sql...');
  const seedSql = fs.readFileSync(path.join(__dirname, 'seed.sql'), 'utf-8');
  await connection.query(seedSql);
  console.log('seed.sql executed successfully.');

  await connection.end();
  console.log('Database initialization completed.');
}

initDB().catch(err => {
  console.error('Initialization error:', err);
  process.exit(1);
});
