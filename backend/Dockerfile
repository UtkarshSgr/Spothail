FROM node:20-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install

# Copy application source code
COPY . .

# Expose backend port
EXPOSE 4000

ENV PORT=4000
ENV NODE_ENV=development

# Run development server with live reload
CMD ["npm", "run", "dev"]
