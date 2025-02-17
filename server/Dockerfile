# Use Node.js 18 as the base image
FROM node:20

# Set the working directory
WORKDIR /app

# Copy package.json and install dependencies
COPY package.json .
RUN npm install

# Copy the server code
COPY src/ ./src/

COPY .env ./.env

# Expose the server port
EXPOSE 3000

# Start the server
CMD ["node", "src/app.js"]