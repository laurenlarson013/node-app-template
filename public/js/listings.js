async function loadListings() {
    const response = await fetch("/api/listings");
    const listings = await response.json();
    renderListings(listings);
}

function renderListings(listings) {
    const container = document.getElementById("listingsContainer");
    container.innerHTML = "";

    listings.forEach(listing => {
        const card = document.createElement("div");
        card.classList.add("listing-card");

        const photos = JSON.parse(listing.photos || "[]");
        const firstPhoto = photos[0] || "default.jpg";

        card.innerHTML = `
            <img class="listing-photo" src="${firstPhoto}" alt="${listing.title}">
            
            <h3>${listing.title}</h3>
            <p class="price">$${listing.price}</p>

            <div class="seller-info">
                <img class="seller-photo" src="${listing.seller_photo}" alt="${listing.seller_name}">
                <div>
                    <p class="seller-name">${listing.seller_name}</p>
                    <p class="seller-university">${listing.seller_university}</p>
                </div>
            </div>
        `;

        container.appendChild(card);
    });
}

document.addEventListener("DOMContentLoaded", loadListings);
