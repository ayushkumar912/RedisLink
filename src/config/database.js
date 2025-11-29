const mongoose = require('mongoose');
const config = require('./index');

class DatabaseManager {
  constructor() {
    this.isConnected = false;
    this.connectionPromise = null;
  }

  async connect() {
    if (this.connectionPromise) {
      return this.connectionPromise;
    }

    this.connectionPromise = this._connect();
    return this.connectionPromise;
  }

  async _connect() {
    try {
      mongoose.set('strictQuery', true);
      
      mongoose.connection.on('connected', () => {
        console.log('MongoDB connected successfully');
        this.isConnected = true;
      });

      mongoose.connection.on('error', (err) => {
        console.error('MongoDB connection error:', err.message);
        this.isConnected = false;
      });

      mongoose.connection.on('disconnected', () => {
        console.log('MongoDB disconnected');
        this.isConnected = false;
      });

      process.on('SIGINT', async () => {
        await this.disconnect();
        process.exit(0);
      });

      await mongoose.connect(config.database.mongoUri, config.database.options);
      return mongoose.connection;
    } catch (error) {
      console.error('Failed to connect to MongoDB:', error.message);
      this.connectionPromise = null;
      throw error;
    }
  }

  async disconnect() {
    try {
      await mongoose.connection.close();
      console.log('MongoDB connection closed');
      this.isConnected = false;
      this.connectionPromise = null;
    } catch (error) {
      console.error('Error closing MongoDB connection:', error.message);
    }
  }

  getConnectionStatus() {
    return {
      isConnected: this.isConnected,
      readyState: mongoose.connection.readyState,
      host: mongoose.connection.host,
      port: mongoose.connection.port,
      name: mongoose.connection.name
    };
  }
}

module.exports = new DatabaseManager();