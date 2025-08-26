# Yeoriggun AI

A Node.js Express server with AI capabilities, file upload support, and RESTful API endpoints.

## 🚀 Features

- Express.js server with CORS support
- File upload handling with Multer
- Environment variable configuration
- Health check endpoints
- Ready for AI integration

## 📦 Installation

1. Clone the repository:
```bash
git clone https://github.com/khtml-hackathon/yeoriggun-ai.git
cd yeoriggun-ai
```

2. Install dependencies:
```bash
npm install
```

## 🏃‍♂️ Running the Project

### Development Mode (with auto-reload)
```bash
npm run dev
```

### Production Mode
```bash
npm start
```

The server will start on port 3000 (or the port specified in your environment variables).

## 🌐 API Endpoints

- `GET /` - Welcome message and server status
- `GET /health` - Health check endpoint

## 🔧 Configuration

Create a `.env` file in the root directory to configure environment variables:

```env
PORT=3000
# Add your API keys and other configuration here
```

## 📁 Project Structure

```
yeoriggun-ai/
├── index.js          # Main server file
├── package.json      # Dependencies and scripts
├── uploads/          # File upload directory
├── .gitignore        # Git ignore rules
└── README.md         # This file
```

## 🛠️ Dependencies

- **express**: Web framework
- **cors**: Cross-origin resource sharing
- **multer**: File upload handling
- **axios**: HTTP client for external API calls
- **dotenv**: Environment variable management
- **form-data**: Form data handling

## 📝 Development

The project is set up with nodemon for development, which will automatically restart the server when you make changes to the code.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## 📄 License

ISC