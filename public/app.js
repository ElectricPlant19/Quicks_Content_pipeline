document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('pipeline-form');
    const urlInput = document.getElementById('url-input');
    const submitBtn = document.getElementById('submit-btn');
    const statusArea = document.getElementById('status-area');
    const resultsArea = document.getElementById('results-area');
    const spinner = submitBtn.querySelector('.spinner');
    const btnText = submitBtn.querySelector('.btn-text');

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const url = urlInput.value.trim();
        if (!url) return;

        // Reset UI
        resultsArea.innerHTML = '';
        statusArea.classList.remove('hidden');
        submitBtn.disabled = true;
        spinner.classList.remove('hidden');
        btnText.classList.add('hidden');

        try {
            const controller = new AbortController();
            const timeoutMs = 90000;
            const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

            const response = await fetch('/api/process', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url }),
                signal: controller.signal,
            });
            clearTimeout(timeoutId);

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to process URL');
            }

            renderCards(data.cards);
        } catch (err) {
            if (err.name === 'AbortError') {
                alert('Error: Request timed out. Try again, or use a shorter URL/article.');
                return;
            }
            alert(`Error: ${err.message}`);
        } finally {
            statusArea.classList.add('hidden');
            submitBtn.disabled = false;
            spinner.classList.add('hidden');
            btnText.classList.remove('hidden');
        }
    });

    function renderCards(cards) {
        if (!cards || cards.length === 0) {
            resultsArea.innerHTML = '<p class="subtitle">No high-quality insights found for this URL.</p>';
            return;
        }

        const template = document.getElementById('card-template');

        cards.forEach((card, index) => {
            const clone = template.content.cloneNode(true);
            const cardEl = clone.querySelector('.insight-card');

            // Set staggered delay
            cardEl.style.animationDelay = `${index * 0.1}s`;

            clone.querySelector('.category').textContent = card.category;
            clone.querySelector('.score').textContent = `${card.score}/10`;
            clone.querySelector('.hook').textContent = card.hook;
            clone.querySelector('.insight').textContent = card.insight;

            // Handle image
            if (card.image_url) {
                const imgContainer = clone.querySelector('.image-container');
                const img = clone.querySelector('.card-image');
                img.src = card.image_url;
                img.alt = card.hook;
                imgContainer.classList.remove('hidden');
            }

            if (card.twist) {
                clone.querySelector('.twist-container').classList.remove('hidden');
                clone.querySelector('.twist').textContent = card.twist;
            }

            const tagsContainer = clone.querySelector('.tags');
            card.tags.forEach(tag => {
                const tagEl = document.createElement('span');
                tagEl.className = 'tag';
                tagEl.textContent = tag;
                tagsContainer.appendChild(tagEl);
            });

            // Copy to clipboard
            clone.querySelector('.copy-btn').addEventListener('click', () => {
                const text = `**${card.hook}**\n\n${card.insight}\n\n${card.twist ? `*The Twist:* ${card.twist}` : ''}`;
                navigator.clipboard.writeText(text).then(() => {
                    alert('Copied to clipboard!');
                });
            });

            resultsArea.appendChild(clone);
        });
    }
});
