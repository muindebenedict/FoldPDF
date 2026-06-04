# Use a Node.js base image built on Debian Bookworm
FROM node:20-bookworm-slim

# System packages installation including Python and pip
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    curl \
    build-essential \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Install LibreOffice as requested after the existing system installs
RUN apt-get update && apt-get install -y \
    libreoffice \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Set working directory for app
WORKDIR /app

# Copy dependency structures
COPY package*.json ./
COPY requirements.txt ./

# Install Node dependencies
RUN npm install

# Install Python requirements (using --break-system-packages flag for Debian Bookworm container environments)
RUN pip3 install --no-cache-dir -r requirements.txt --break-system-packages || pip3 install --no-cache-dir -r requirements.txt

# Copy source repository
COPY . .

# Build application
RUN npm run build

# Expose port and start
EXPOSE 3000
CMD ["npm", "start"]
