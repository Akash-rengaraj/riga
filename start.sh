#!/bin/bash

echo "🚀 Starting Project Holy Grail..."

# Function to clean up background processes on exit
cleanup() {
    echo ""
    echo "🛑 Shutting down servers..."
    # Kill the processes if they exist
    kill $BACKEND_PID 2>/dev/null
    kill $FRONTEND_PID 2>/dev/null
    echo "✅ Servers stopped."
    exit 0
}

# Trap SIGINT (Ctrl+C) and SIGTERM and call cleanup
trap cleanup SIGINT SIGTERM

# Start Backend
echo "Starting FastAPI Backend on http://127.0.0.1:8000 ..."
cd backend || exit

if [ ! -d "venv" ]; then
    echo "Creating Python virtual environment..."
    python3 -m venv venv
fi

source venv/bin/activate
pip install -r requirements.txt

python3 -m uvicorn main:app --reload --host 127.0.0.1 --port 8000 &
BACKEND_PID=$!
cd ..

# Start Frontend
echo "Starting React Frontend..."
cd frontend || exit
npm run dev &
FRONTEND_PID=$!
cd ..

echo "✅ Both servers are running in the background."
echo "Backend PID: $BACKEND_PID"
echo "Frontend PID: $FRONTEND_PID"
echo ""
echo "Press Ctrl+C to stop both servers."

# Wait for background processes
wait $BACKEND_PID $FRONTEND_PID
