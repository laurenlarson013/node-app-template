document.addEventListener("DOMContentLoaded", () => {
    setupPage();
    loadMyListings();
  });
  
  function setupPage() {
    document.getElementById("logoutBtn")?.addEventListener("click", () => {
      localStorage.removeItem("jwtToken");
      window.location.href = "/";
    });
  }
  
  async function loadMyListings() {
    const token = localStorage.getItem("jwtToken");
    const statusEl = document.getElementById("myListingsStatus");
    const bodyEl = document.getElementById("myListingsBody");
  
    if (!statusEl || !bodyEl) return;
  
    bodyEl.innerHTML = "";
    statusEl.style.display = "block";
    statusEl.textContent = "Loading your listings...";
  
    if (!token) {
      statusEl.textContent = "You are not logged in.";
      return;
    }
  
    try {
      const response = await fetch("/api/my-listings", {
        method: "GET",
        headers: {
          authorization: token
        }
      });
  
      const data = await response.json();
  
      if (!response.ok) {
        throw new Error(data.message || `Request failed with status ${response.status}`);
      }
  
      if (!Array.isArray(data)) {
        throw new Error("Invalid response format.");
      }
  
      renderMyListings(data);
    } catch (error) {
      console.error("Error loading my listings:", error);
      statusEl.textContent = error.message || "Could not load your listings.";
    }
  }
  
  function renderMyListings(listings) {
    const statusEl = document.getElementById("myListingsStatus");
    const bodyEl = document.getElementById("myListingsBody");
  
    if (!statusEl || !bodyEl) return;
  
    bodyEl.innerHTML = "";
  
    if (!listings.length) {
      statusEl.style.display = "block";
      statusEl.textContent = "You have no listings yet.";
      return;
    }
  
    statusEl.style.display = "none";
  
    listings.forEach((listing) => {
      const row = document.createElement("tr");
  
      const title = listing.title || "Untitled";
      const price = formatPrice(listing.price);
      const posted = formatDate(listing.created_at);
      const status = listing.status || "Active";
  
      row.innerHTML = `
        <td>${escapeHtml(title)}</td>
        <td><span class="pill">${escapeHtml(status)}</span></td>
        <td>${price}</td>
        <td>${posted}</td>
        <td>
          <div class="my-listing-actions">
            <button class="btn edit-btn" data-id="${listing.listing_id}">Edit</button>
            <button class="btn sold-btn" data-id="${listing.listing_id}">Mark Sold</button>
            <button class="btn delete-btn" data-id="${listing.listing_id}">Delete</button>
          </div>
        </td>
      `;
  
      row.querySelector(".edit-btn").addEventListener("click", () => editListing(listing));
      row.querySelector(".sold-btn").addEventListener("click", () => markListingSold(listing.listing_id));
      row.querySelector(".delete-btn").addEventListener("click", () => deleteListing(listing.listing_id));
  
      bodyEl.appendChild(row);
    });
  }
  
  async function editListing(listing) {
    const token = localStorage.getItem("jwtToken");
  
    const newTitle = prompt("Edit title:", listing.title || "");
    if (newTitle === null) return;
  
    const newDescription = prompt("Edit description:", listing.listing_description || listing.description || "");
    if (newDescription === null) return;
  
    const newPrice = prompt("Edit price:", listing.price || "");
    if (newPrice === null) return;
  
    try {
      const response = await fetch(`/api/listings/${listing.listing_id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          authorization: token
        },
        body: JSON.stringify({
          title: newTitle,
          description: newDescription,
          price: newPrice,
          university: listing.university || "",
          category: listing.category || "",
          trade_option: listing.trade_option || "None",
          item_condition: listing.item_condition || "Good",
          pickup_details: listing.pickup_details || "MU",
          photos: listing.photos || ""
        })
      });
  
      const data = await response.json();
  
      if (!response.ok) {
        throw new Error(data.message || `Edit failed with status ${response.status}`);
      }
  
      loadMyListings();
    } catch (error) {
      console.error("Error editing listing:", error);
      alert(error.message || "Could not edit listing.");
    }
  }
  
  async function markListingSold(id) {
    const token = localStorage.getItem("jwtToken");
  
    try {
      const response = await fetch(`/api/listings/${id}/mark-sold`, {
        method: "PUT",
        headers: {
          authorization: token
        }
      });
  
      const data = await response.json();
  
      if (!response.ok) {
        throw new Error(data.message || `Mark sold failed with status ${response.status}`);
      }
  
      loadMyListings();
    } catch (error) {
      console.error("Error marking listing sold:", error);
      alert(error.message || "Could not mark listing as sold.");
    }
  }
  
  async function deleteListing(id) {
    const token = localStorage.getItem("jwtToken");
    const confirmed = confirm("Are you sure you want to delete this listing?");
    if (!confirmed) return;
  
    try {
      const response = await fetch(`/api/listings/${id}`, {
        method: "DELETE",
        headers: {
          authorization: token
        }
      });
  
      const data = await response.json();
  
      if (!response.ok) {
        throw new Error(data.message || `Delete failed with status ${response.status}`);
      }
  
      loadMyListings();
    } catch (error) {
      console.error("Error deleting listing:", error);
      alert(error.message || "Could not delete listing.");
    }
  }
  
  function formatPrice(price) {
    const number = Number(price);
    if (Number.isNaN(number)) return "Price unavailable";
    return `$${number.toFixed(0)}`;
  }
  
  function formatDate(dateString) {
    if (!dateString) return "Unknown";
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return "Unknown";
    return date.toLocaleDateString();
  }
  
  function escapeHtml(value) {
    const div = document.createElement("div");
    div.textContent = value || "";
    return div.innerHTML;
  }

  let currentEditingListing = null;

document.addEventListener("DOMContentLoaded", () => {
  setupPage();
  setupEditModal();
  loadMyListings();
});

function setupPage() {
  document.getElementById("logoutBtn")?.addEventListener("click", () => {
    localStorage.removeItem("jwtToken");
    window.location.href = "/";
  });
}

function setupEditModal() {
  document.getElementById("editListingClose")?.addEventListener("click", closeEditModal);
  document.getElementById("editListingBackdrop")?.addEventListener("click", closeEditModal);
  document.getElementById("cancelListingChanges")?.addEventListener("click", closeEditModal);
  document.getElementById("saveListingChanges")?.addEventListener("click", saveListingChanges);

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeEditModal();
    }
  });
}

async function loadMyListings() {
  const token = localStorage.getItem("jwtToken");
  const statusEl = document.getElementById("myListingsStatus");
  const bodyEl = document.getElementById("myListingsBody");

  if (!statusEl || !bodyEl) return;

  bodyEl.innerHTML = "";
  statusEl.style.display = "block";
  statusEl.textContent = "Loading your listings...";

  if (!token) {
    statusEl.textContent = "You are not logged in.";
    return;
  }

  try {
    const response = await fetch("/api/my-listings", {
      method: "GET",
      headers: {
        authorization: token
      }
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || `Request failed with status ${response.status}`);
    }

    if (!Array.isArray(data)) {
      throw new Error("Invalid response format.");
    }

    renderMyListings(data);
  } catch (error) {
    console.error("Error loading my listings:", error);
    statusEl.textContent = error.message || "Could not load your listings.";
  }
}

function renderMyListings(listings) {
  const statusEl = document.getElementById("myListingsStatus");
  const bodyEl = document.getElementById("myListingsBody");

  if (!statusEl || !bodyEl) return;

  bodyEl.innerHTML = "";

  if (!listings.length) {
    statusEl.style.display = "block";
    statusEl.textContent = "You have no listings yet.";
    return;
  }

  statusEl.style.display = "none";

  listings.forEach((listing) => {
    const row = document.createElement("tr");

    const title = listing.title || "Untitled";
    const price = formatPrice(listing.price);
    const posted = formatDate(listing.created_at);
    const status = listing.status || "Active";

    row.innerHTML = `
      <td>${escapeHtml(title)}</td>
      <td><span class="pill">${escapeHtml(status)}</span></td>
      <td>${price}</td>
      <td>${posted}</td>
      <td>
        <div class="my-listing-actions">
          <button class="btn edit-btn">Edit</button>
          <button class="btn sold-btn">Mark Sold</button>
          <button class="btn delete-btn">Delete</button>
        </div>
      </td>
    `;

    row.querySelector(".edit-btn").addEventListener("click", () => openEditModal(listing));
    row.querySelector(".sold-btn").addEventListener("click", () => markListingSold(listing.listing_id));
    row.querySelector(".delete-btn").addEventListener("click", () => deleteListing(listing.listing_id));

    bodyEl.appendChild(row);
  });
}

function openEditModal(listing) {
  currentEditingListing = listing;

  document.getElementById("editTitle").value = listing.title || "";
  document.getElementById("editDescription").value =
    listing.listing_description || listing.description || "";
  document.getElementById("editPrice").value = listing.price || "";
  document.getElementById("editUniversity").value = listing.university || "";
  document.getElementById("editCategory").value = listing.category || "";
  document.getElementById("editTradeOption").value = listing.trade_option || "";
  document.getElementById("editCondition").value = listing.item_condition || "";
  document.getElementById("editPickup").value = listing.pickup_details || "";
  document.getElementById("editPhotos").value = listing.photos || "";

  const modal = document.getElementById("editListingModal");
  modal.classList.remove("hidden");
  document.body.classList.add("modal-open");
}

function closeEditModal() {
  const modal = document.getElementById("editListingModal");
  modal.classList.add("hidden");
  document.body.classList.remove("modal-open");
  currentEditingListing = null;
}

async function saveListingChanges() {
  if (!currentEditingListing) return;

  const token = localStorage.getItem("jwtToken");

  const payload = {
    title: document.getElementById("editTitle").value.trim(),
    description: document.getElementById("editDescription").value.trim(),
    price: document.getElementById("editPrice").value.trim(),
    university: document.getElementById("editUniversity").value.trim(),
    category: document.getElementById("editCategory").value.trim(),
    trade_option: document.getElementById("editTradeOption").value.trim(),
    item_condition: document.getElementById("editCondition").value.trim(),
    pickup_details: document.getElementById("editPickup").value.trim(),
    photos: document.getElementById("editPhotos").value.trim()
  };

  try {
    const response = await fetch(`/api/listings/${currentEditingListing.listing_id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        authorization: token
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || `Edit failed with status ${response.status}`);
    }

    closeEditModal();
    loadMyListings();
  } catch (error) {
    console.error("Error editing listing:", error);
    alert(error.message || "Could not save changes.");
  }
}

async function markListingSold(id) {
  const token = localStorage.getItem("jwtToken");

  try {
    const response = await fetch(`/api/listings/${id}/mark-sold`, {
      method: "PUT",
      headers: {
        authorization: token
      }
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || `Mark sold failed with status ${response.status}`);
    }

    loadMyListings();
  } catch (error) {
    console.error("Error marking listing sold:", error);
    alert(error.message || "Could not mark listing as sold.");
  }
}

async function deleteListing(id) {
  const token = localStorage.getItem("jwtToken");
  const confirmed = confirm("Are you sure you want to delete this listing?");
  if (!confirmed) return;

  try {
    const response = await fetch(`/api/listings/${id}`, {
      method: "DELETE",
      headers: {
        authorization: token
      }
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || `Delete failed with status ${response.status}`);
    }

    loadMyListings();
  } catch (error) {
    console.error("Error deleting listing:", error);
    alert(error.message || "Could not delete listing.");
  }
}

function formatPrice(price) {
  const number = Number(price);
  if (Number.isNaN(number)) return "Price unavailable";
  return `$${number.toFixed(0)}`;
}

function formatDate(dateString) {
  if (!dateString) return "Unknown";
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return date.toLocaleDateString();
}

function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = value || "";
  return div.innerHTML;
}