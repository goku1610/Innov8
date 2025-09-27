FROM gcc:latest

# Set working directory
WORKDIR /work

# Install additional tools
RUN apt-get update && apt-get install -y \
    && rm -rf /var/lib/apt/lists/*

# Default command
CMD ["g++"]
