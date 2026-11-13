import { connectDB } from './config/db.js';
import { createApp } from './app.js';

const port = Number(process.env.PORT) || 3000;

try {
  await connectDB(process.env.MONGODB_URI);
} catch (err) {
  console.error(`Could not connect to MongoDB: ${err.message}`);
  process.exit(1);
}

createApp().listen(port, () => {
  console.log(`The Pod Café is open at http://localhost:${port}`);
});
