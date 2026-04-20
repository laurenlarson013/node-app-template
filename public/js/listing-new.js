const form = document.getElementById('create-listing-form');
const messageEl = document.getElementById('message');

const token = localStorage.getItem('jwtToken');
if (!token) {
    window.location.href = '/';
}

form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const title = document.getElementById('title').value.trim();
    const description = document.getElementById('description').value.trim();
    const price = document.getElementById('price').value.trim();
    const photos = document.getElementById('photos').value.trim();
    const category = document.getElementById('category').value;
    const trade_option = document.getElementById('trade_option').value;
    const item_condition = document.getElementById('item_condition').value;
    const pickup_details = document.getElementById('pickup_details').value.trim();

    try {
        const response = await fetch('/api/listings', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': token
            },
            body: JSON.stringify({
                title,
                description,
                price,
                photos,
                category,
                trade_option,
                item_condition,
                pickup_details
            })
        });

        const result = await response.json();

        if (response.ok) {
            messageEl.textContent = 'Listing created successfully!';
            messageEl.style.color = 'green';
            form.reset();
        } else {
            messageEl.textContent = result.message || 'Failed to create listing.';
            messageEl.style.color = 'red';
        }
    } catch (error) {
        console.error('Error creating listing:', error);
        messageEl.textContent = 'Unable to create listing right now.';
        messageEl.style.color = 'red';
    }
});