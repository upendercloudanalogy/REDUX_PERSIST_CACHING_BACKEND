import express from 'express'
import routes from './routes/index.js'
import cors from 'cors';
import './redis-client.js'

const app = express();
app.use(cors({
  origin: 'http://localhost:5173', // frontend URL
  credentials: true,
   exposedHeaders: ["ETag"],
}));
app.use(express.json());

app.use(routes);

app.listen(3000, () => console.log("Server running at http://localhost:3000"));