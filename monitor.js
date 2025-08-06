#!/usr/bin/env node

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class ProcessMonitor {
    constructor() {
        this.restartCount = 0;
        this.maxRestarts = 5;
        this.restartDelay = 5000; // 5 seconds
    }

    start() {
        console.log('Starting process monitor...');
        this.spawnProcess();
    }

    spawnProcess() {
        const appPath = join(__dirname, 'src', 'now_playing.js');

        console.log(`Spawning process: ${appPath}`);

        const child = spawn('node', [appPath], {
            stdio: 'inherit',
            env: { ...process.env, NODE_ENV: process.env.NODE_ENV || 'production' },
        });

        child.on('exit', (code, signal) => {
            const timestamp = new Date().toISOString();
            console.log(`[${timestamp}] Process exited with code: ${code}, signal: ${signal}`);

            if (code !== 0 && this.restartCount < this.maxRestarts) {
                this.restartCount++;
                console.log(`[${timestamp}] Restarting process (attempt ${this.restartCount}/${this.maxRestarts}) in ${this.restartDelay}ms...`);

                setTimeout(() => {
                    this.spawnProcess();
                }, this.restartDelay);
            } else if (this.restartCount >= this.maxRestarts) {
                console.log(`[${timestamp}] Max restart attempts reached. Stopping monitor.`);
                process.exit(1);
            } else {
                console.log(`[${timestamp}] Process exited normally.`);
                process.exit(0);
            }
        });

        child.on('error', (error) => {
            const timestamp = new Date().toISOString();
            console.error(`[${timestamp}] Failed to start process:`, error);
        });

        // Handle parent process signals
        process.on('SIGINT', () => {
            console.log('Received SIGINT, terminating child process...');
            child.kill('SIGINT');
        });

        process.on('SIGTERM', () => {
            console.log('Received SIGTERM, terminating child process...');
            child.kill('SIGTERM');
        });
    }
}

const monitor = new ProcessMonitor();
monitor.start();
