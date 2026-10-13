@echo off
rem Runs the Kyber Squad agent and appends its output to data\agent.log
cd /d "%~dp0.."
if not exist data mkdir data
node index.js >> data\agent.log 2>&1
