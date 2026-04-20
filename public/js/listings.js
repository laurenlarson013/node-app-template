let allListings = [];
let activeListing = null;

const DEFAULT_IMAGE = "/images/default.jpg";

document.addEventListener("DOMContentLoaded", () => {
  setupEventListeners();
  setupModalEvents();
  setupMessageSeller();
  setupOfferTrade();
  loadListings();
});

function setupEventListeners() {
  const applyBtn = document.getElementById("applyFiltersBtn");
  const clearBtn = document.getElementById("clearFiltersBtn");
  const logoutBtn = document.getElementById("logoutBtn");
  const searchInput = document.getElementById("searchInput");

  if (applyBtn) {
    applyBtn.addEventListener("click", applyFilters);
  }

  if (clearBtn) {
    clearBtn.addEventListener("click", clearFilters);
  }

  if (searchInput) {
    searchInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        applyFilters();
      }
    });
  }

  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
      localStorage.removeItem("jwtToken");
      localStorage.removeItem("activeConversationId");
      localStorage.removeItem("messageListingTitle");
      localStorage.removeItem("tradeListingId");
      localStorage.removeItem("tradeListingTitle");
      window.location.href = "/";
    });
  }
}

async function loadListings() {
  const statusEl = document.getElementById("listingsStatus");
  const container = document.getElementById("listingsContainer");

  if (!statusEl || !container) return;

  statusEl.textContent = "Loading listings...";
  statusEl.style.display = "block";
  container.innerHTML = "";

  try {
    const response = await fetch("/api/listings");

    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`);
    }

    const data = await response.json();

    if (!Array.isArray(data)) {
      throw new Error("Invalid listings response format.");
    }

    allListings = data;
    renderListings(allListings);
  } catch (error) {
    console.error("Error loading listings:", error);
    statusEl.textContent = "Could not load listings. Please try again.";
    statusEl.style.display = "block";
  }
}

function applyFilters() {
  const searchValue =
    document.getElementById("searchInput")?.value.trim().toLowerCase() || "";
  const categoryValue =
    document.getElementById("categoryFilter")?.value || "All";
  const sortValue = document.getElementById("sortFilter")?.value || "newest";
  const maxPriceValue =
    document.getElementById("priceFilter")?.value.trim() || "";

  let filtered = [...allListings];

  if (searchValue) {
    filtered = filtered.filter((listing) => {
      const title = (listing.title || "").toLowerCase();
      const description =
        (listing.description || listing.listing_description || "").toLowerCase();
      const category = (listing.category || "").toLowerCase();
      const university = (listing.university || "").toLowerCase();

      return (
        title.includes(searchValue) ||
        description.includes(searchValue) ||
        category.includes(searchValue) ||
        university.includes(searchValue)
      );
    });
  }

  if (categoryValue !== "All") {
    filtered = filtered.filter(
      (listing) => (listing.category || "") === categoryValue
    );
  }

  if (maxPriceValue) {
    const maxPrice = Number(maxPriceValue);
    filtered = filtered.filter((listing) => Number(listing.price) <= maxPrice);
  }

  if (sortValue === "price-low") {
    filtered.sort((a, b) => Number(a.price) - Number(b.price));
  } else if (sortValue === "price-high") {
    filtered.sort((a, b) => Number(b.price) - Number(a.price));
  } else {
    filtered.sort(
      (a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)
    );
  }

  renderListings(filtered);
}

function clearFilters() {
  const searchInput = document.getElementById("searchInput");
  const categoryFilter = document.getElementById("categoryFilter");
  const sortFilter = document.getElementById("sortFilter");
  const priceFilter = document.getElementById("priceFilter");

  if (searchInput) searchInput.value = "";
  if (categoryFilter) categoryFilter.value = "All";
  if (sortFilter) sortFilter.value = "newest";
  if (priceFilter) priceFilter.value = "";

  renderListings(allListings);
}

function renderListings(listings) {
  const container = document.getElementById("listingsContainer");
  const statusEl = document.getElementById("listingsStatus");

  if (!container || !statusEl) return;

  container.innerHTML = "";

  if (!listings.length) {
    statusEl.textContent = "No listings match your filters.";
    statusEl.style.display = "block";
    return;
  }

  statusEl.style.display = "none";

  listings.forEach((listing) => {
    const card = document.createElement("article");
    card.className = "listing-card";
    card.dataset.id = listing.listing_id || listing.id || "";

    const imageSrc = getListingImage(listing.photos);
    const price = formatPrice(listing.price);
    const category = listing.category || "Listing";
    const title = listing.title || "Untitled Listing";
    const description =
      listing.description ||
      listing.listing_description ||
      "No description provided.";
    const sellerName = listing.seller_name || "Unknown seller";
    const sellerUniversity =
      listing.seller_university || listing.university || "";
    const tradeOption = listing.trade_option || "For Sale";

    card.innerHTML = `
      <div class="listing-image-wrap">
        <img
          src="${imageSrc}"
          alt="${escapeHtml(title)}"
          class="listing-image"
        />
      </div>

      <div class="listing-card-body">
        <div class="listing-top-row">
          <span class="listing-category">${escapeHtml(category)}</span>
          <span class="listing-trade">${escapeHtml(tradeOption)}</span>
        </div>

        <h3 class="listing-title">${escapeHtml(title)}</h3>
        <p class="listing-price">${price}</p>
        <p class="listing-description">${escapeHtml(description)}</p>

        <div class="listing-meta">
          <span>${escapeHtml(sellerName)}</span>
          ${
            sellerUniversity
              ? `<span>${escapeHtml(sellerUniversity)}</span>`
              : ""
          }
        </div>
      </div>
    `;

    const img = card.querySelector("img");
    img.addEventListener("error", () => {
      img.src = DEFAULT_IMAGE;
    });

    card.addEventListener("click", () => {
      console.log("opening modal", listing);
      openListingModal(listing);
    });

    container.appendChild(card);
  });
}

function getListingImage(photos) {
  if (!photos) return DEFAULT_IMAGE;

  if (typeof photos === "string") {
    const trimmed = photos.trim();

    if (
      trimmed.startsWith("data:image/") ||
      trimmed.startsWith("http://") ||
      trimmed.startsWith("https://") ||
      trimmed.startsWith("/")
    ) {
      return trimmed;
    }

    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed) && parsed.length > 0 && parsed[0]) {
        return parsed[0];
      }
    } catch (error) {
      return DEFAULT_IMAGE;
    }
  }

  if (Array.isArray(photos) && photos.length > 0 && photos[0]) {
    return photos[0];
  }

  return DEFAULT_IMAGE;
}

function formatPrice(price) {
  const number = Number(price);
  if (Number.isNaN(number)) return "Price unavailable";
  return `$${number.toFixed(2)}`;
}

function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = value || "";
  return div.innerHTML;
}

function openListingModal(listing) {
  activeListing = listing;

  const modal = document.getElementById("listingModal");
  if (!modal) return;

  const image = document.getElementById("modalImage");
  const category = document.getElementById("modalCategory");
  const trade = document.getElementById("modalTrade");
  const title = document.getElementById("modalTitle");
  const price = document.getElementById("modalPrice");
  const description = document.getElementById("modalDescription");
  const condition = document.getElementById("modalCondition");
  const university = document.getElementById("modalUniversity");
  const pickup = document.getElementById("modalPickup");
  const seller = document.getElementById("modalSeller");
  const offerTradeBtn = document.querySelector(".modal-action-btn");

  const imageSrc = getListingImage(listing.photos);

  image.src = imageSrc;
  image.alt = listing.title || "Listing image";
  image.onerror = () => {
    image.src = DEFAULT_IMAGE;
  };

  category.textContent = listing.category || "Listing";
  trade.textContent = listing.trade_option || "For Sale";
  title.textContent = listing.title || "Untitled Listing";
  price.textContent = formatPrice(listing.price);
  description.textContent =
    listing.description || listing.listing_description || "No description provided.";
  condition.textContent = listing.item_condition || "Not listed";
  university.textContent =
    listing.seller_university || listing.university || "Not listed";
  pickup.textContent = listing.pickup_details || "Not listed";
  seller.textContent = listing.seller_name || "Unknown seller";

  if (offerTradeBtn) {
    const tradeOptionValue = (listing.trade_option || "").toLowerCase();
    const allowsTrade =
      tradeOptionValue.includes("trade") || tradeOptionValue === "open to trade";

    offerTradeBtn.style.display = allowsTrade ? "inline-block" : "none";
    offerTradeBtn.disabled = !allowsTrade;
  }

  modal.classList.remove("hidden");
  document.body.classList.add("modal-open");
}

function closeListingModal() {
  const modal = document.getElementById("listingModal");
  if (!modal) return;

  modal.classList.add("hidden");
  document.body.classList.remove("modal-open");
}

function setupModalEvents() {
  const closeBtn = document.getElementById("listingModalClose");
  const backdrop = document.getElementById("listingModalBackdrop");

  closeBtn?.addEventListener("click", closeListingModal);
  backdrop?.addEventListener("click", closeListingModal);

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeListingModal();
    }
  });
}

function setupMessageSeller() {
  const messageBtn = document.getElementById("messageSellerBtn");
  if (!messageBtn) return;

  messageBtn.addEventListener("click", async () => {
    if (!activeListing) {
      alert("No listing selected.");
      return;
    }

    const token = localStorage.getItem("jwtToken");
    if (!token) {
      window.location.href = "/";
      return;
    }

    try {
      const recipientEmail =
        activeListing.user_email ||
        activeListing.seller_email ||
        activeListing.email;

      if (!recipientEmail) {
        throw new Error("Seller email not found for this listing.");
      }

      const response = await fetch("/api/conversations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": token
        },
        body: JSON.stringify({
          recipientEmail,
          listingId: activeListing.listing_id || activeListing.id
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Failed to start conversation.");
      }

      const conversationId =
        data.conversation_id ||
        data.conversationId ||
        data.id;

      if (!conversationId) {
        throw new Error("Conversation created, but no conversation ID returned.");
      }

      localStorage.setItem("activeConversationId", conversationId);
      localStorage.setItem("messageListingTitle", activeListing.title || "");

      window.location.href = "/messages";
    } catch (error) {
      console.error("Message Seller error:", error);
      alert(error.message || "Could not start conversation.");
    }
  });
}

function setupOfferTrade() {
  const offerTradeBtn = document.querySelector(".modal-action-btn");
  if (!offerTradeBtn) return;

  offerTradeBtn.addEventListener("click", async () => {
    if (!activeListing) {
      alert("No listing selected.");
      return;
    }

    const token = localStorage.getItem("jwtToken");
    if (!token) {
      window.location.href = "/";
      return;
    }

    try {
      const recipientEmail =
        activeListing.user_email ||
        activeListing.seller_email ||
        activeListing.email;

      if (!recipientEmail) {
        throw new Error("Seller email not found for this listing.");
      }

      const response = await fetch("/api/conversations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": token
        },
        body: JSON.stringify({
          recipientEmail,
          listingId: activeListing.listing_id || activeListing.id
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Failed to start trade conversation.");
      }

      const conversationId =
        data.conversation_id ||
        data.conversationId ||
        data.id;

      if (!conversationId) {
        throw new Error("Conversation created, but no conversation ID returned.");
      }

      localStorage.setItem("activeConversationId", conversationId);
      localStorage.setItem("tradeListingId", activeListing.listing_id || activeListing.id);
      localStorage.setItem("tradeListingTitle", activeListing.title || "");

      window.location.href = "/messages";
    } catch (error) {
      console.error("Offer Trade error:", error);
      alert(error.message || "Could not start trade flow.");
    }
  });
}