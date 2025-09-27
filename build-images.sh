#!/bin/bash

echo "Building Docker images for code execution platform..."

# Build Python image
echo "Building Python image..."
docker build -t python:3.9-custom ./docker/python/

# Build Node.js image
echo "Building Node.js image..."
docker build -t node:18-custom ./docker/node/

# Build Java image
echo "Building Java image..."
docker build -t openjdk:11-custom ./docker/java/

# Build C/C++ image
echo "Building C/C++ image..."
docker build -t gcc:latest-custom ./docker/c/

echo "All images built successfully!"
echo ""
echo "Available images:"
docker images | grep -E "(python:3.9-custom|node:18-custom|openjdk:11-custom|gcc:latest-custom)"
