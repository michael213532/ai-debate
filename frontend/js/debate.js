/**
 * Debate UI and WebSocket handling
 */

let debateWebSocket = null;
let currentDebateId = null;
let currentRound = 0;
let totalRounds = 0;

// Start debate button
document.getElementById('start-btn').addEventListener('click', startDebate);

// Stop debate button
document.getElementById('stop-btn').addEventListener('click', stopDebate);

// Start a new debate
async function startDebate() {
    const topic = document.getElementById('topic').value.trim();
    const rounds = parseInt(document.getElementById('rounds').value);

    if (!topic || selectedModels.length < 2) {
        return;
    }

    try {
        // Create debate
        const response = await fetch(`${API_BASE}/api/debates`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({
                topic,
                config: {
                    models: selectedModels,
                    rounds,
                    summarizer_index: 0
                }
            })
        });

        if (response.status === 402) {
            // Payment required - show upgrade prompt
            if (confirm('You\'ve used all your free debates. Upgrade to Pro for unlimited debates?')) {
                document.getElementById('upgrade-btn').click();
            }
            return;
        }

        if (!response.ok) throw new Error('Failed to create debate');

        const debate = await response.json();
        currentDebateId = debate.id;
        totalRounds = rounds;
        currentRound = 0;

        // Show debate arena
        showDebateArena();

        // Connect WebSocket
        connectWebSocket(debate.id);

        // Reload history and subscription status
        loadDebateHistory();
        loadSubscriptionStatus();
    } catch (error) {
        console.error('Error starting debate:', error);
        alert('Failed to start debate');
    }
}

// Show debate arena
function showDebateArena() {
    const arena = document.getElementById('debate-arena');
    arena.style.display = 'block';

    // Reset status
    document.getElementById('current-round').textContent = `0/${totalRounds}`;
    document.getElementById('debate-status').textContent = 'Connecting...';
    document.getElementById('debate-status').className = 'status-value status-running';
    document.getElementById('stop-btn').style.display = 'inline-flex';

    // Hide summary
    document.getElementById('summary-section').style.display = 'none';
    document.getElementById('summary-content').textContent = '';

    // Create model panels
    createModelPanels(selectedModels);

    // Scroll to arena
    arena.scrollIntoView({ behavior: 'smooth' });
}

// Create model panels
function createModelPanels(models) {
    const container = document.getElementById('model-panels');
    container.innerHTML = '';

    models.forEach(model => {
        const panel = document.createElement('div');
        panel.className = 'model-panel';
        panel.dataset.model = model.model_name;
        panel.innerHTML = `
            <div class="panel-header">
                <div>
                    <div class="panel-title">${model.model_name}</div>
                    <div class="panel-provider">${model.provider}</div>
                </div>
                <span class="panel-status">Waiting</span>
            </div>
            <div class="panel-content"></div>
        `;
        container.appendChild(panel);
    });
}

// Connect WebSocket
function connectWebSocket(debateId) {
    const token = localStorage.getItem('token');
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/debates/${debateId}?token=${token}`;

    debateWebSocket = new WebSocket(wsUrl);

    debateWebSocket.onopen = () => {
        console.log('WebSocket connected');
        document.getElementById('debate-status').textContent = 'Starting...';
    };

    debateWebSocket.onmessage = (event) => {
        const message = JSON.parse(event.data);
        handleWebSocketMessage(message);
    };

    debateWebSocket.onerror = (error) => {
        console.error('WebSocket error:', error);
        document.getElementById('debate-status').textContent = 'Connection error';
        document.getElementById('debate-status').className = 'status-value status-error';
    };

    debateWebSocket.onclose = () => {
        console.log('WebSocket closed');
        debateWebSocket = null;
    };
}

// Handle WebSocket messages
function handleWebSocketMessage(message) {
    switch (message.type) {
        case 'round_start':
            currentRound = message.round;
            totalRounds = message.total_rounds;
            document.getElementById('current-round').textContent = `${currentRound}/${totalRounds}`;
            document.getElementById('debate-status').textContent = `Round ${currentRound}`;
            break;

        case 'round_end':
            // Round completed
            break;

        case 'model_start':
            const startPanel = document.querySelector(`[data-model="${message.model_name}"]`);
            if (startPanel) {
                startPanel.querySelector('.panel-status').textContent = 'Speaking...';
                startPanel.querySelector('.panel-status').classList.add('speaking');
                prepareResponseSection(startPanel, message.round);
            }
            break;

        case 'chunk':
            const chunkPanel = document.querySelector(`[data-model="${message.model_name}"]`);
            if (chunkPanel) {
                appendToResponse(chunkPanel, message.round, message.content);
            }
            break;

        case 'model_end':
            const endPanel = document.querySelector(`[data-model="${message.model_name}"]`);
            if (endPanel) {
                endPanel.querySelector('.panel-status').textContent = 'Done';
                endPanel.querySelector('.panel-status').classList.remove('speaking');
            }
            break;

        case 'model_error':
            const errorPanel = document.querySelector(`[data-model="${message.model_name}"]`);
            if (errorPanel) {
                errorPanel.querySelector('.panel-status').textContent = 'Error';
                errorPanel.querySelector('.panel-status').classList.remove('speaking');
                addErrorToPanel(errorPanel, message.error);
            }
            break;

        case 'summary_start':
            document.getElementById('summary-section').style.display = 'block';
            document.getElementById('summary-model').textContent = `by ${message.model_name}`;
            document.getElementById('debate-status').textContent = 'Summarizing...';
            break;

        case 'summary_chunk':
            document.getElementById('summary-content').textContent += message.content;
            break;

        case 'summary_end':
            // Summary complete
            break;

        case 'debate_end':
            document.getElementById('debate-status').textContent = message.status === 'completed' ? 'Completed' : 'Stopped';
            document.getElementById('debate-status').className = `status-value status-${message.status}`;
            document.getElementById('stop-btn').style.display = 'none';
            loadDebateHistory();
            break;

        case 'error':
            document.getElementById('debate-status').textContent = 'Error';
            document.getElementById('debate-status').className = 'status-value status-error';
            console.error('Debate error:', message.message);
            break;

        case 'ping':
            // Keep-alive ping, ignore
            break;
    }
}

// Prepare response section in panel
function prepareResponseSection(panel, round) {
    const content = panel.querySelector('.panel-content');
    let section = content.querySelector(`[data-round="${round}"]`);

    if (!section) {
        section = document.createElement('div');
        section.className = 'round-section';
        section.dataset.round = round;
        section.innerHTML = `
            <div class="round-label">Round ${round}</div>
            <div class="response-text"></div>
        `;
        content.appendChild(section);
    }
}

// Append text to response
function appendToResponse(panel, round, text) {
    const section = panel.querySelector(`[data-round="${round}"]`);
    if (section) {
        const responseText = section.querySelector('.response-text');
        responseText.textContent += text;
        // Auto-scroll
        const content = panel.querySelector('.panel-content');
        content.scrollTop = content.scrollHeight;
    }
}

// Add response to panel (for viewing completed debates)
function addResponseToPanel(panel, round, content) {
    prepareResponseSection(panel, round);
    const section = panel.querySelector(`[data-round="${round}"]`);
    if (section) {
        section.querySelector('.response-text').textContent = content;
    }
}

// Add error to panel
function addErrorToPanel(panel, error) {
    const content = panel.querySelector('.panel-content');
    const errorDiv = document.createElement('div');
    errorDiv.className = 'round-section';
    errorDiv.innerHTML = `<div class="response-text" style="color: var(--error-color);">Error: ${escapeHtml(error)}</div>`;
    content.appendChild(errorDiv);
}

// Stop debate
async function stopDebate() {
    if (!currentDebateId) return;

    try {
        await fetch(`${API_BASE}/api/debates/${currentDebateId}/stop`, {
            method: 'POST',
            headers: getAuthHeaders()
        });

        if (debateWebSocket) {
            debateWebSocket.send(JSON.stringify({ type: 'stop' }));
        }
    } catch (error) {
        console.error('Error stopping debate:', error);
    }
}

// Clean up on page unload
window.addEventListener('beforeunload', () => {
    if (debateWebSocket) {
        debateWebSocket.close();
    }
});
