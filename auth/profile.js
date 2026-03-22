const token = localStorage.getItem("token");

const preview = document.getElementById("preview");
const imageInput = document.getElementById("imageUrl");

imageInput.addEventListener("input", () => {
  preview.src = imageInput.value;
});

document.getElementById("profileForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  const data = {
    name: document.getElementById("name").value,
    bio: document.getElementById("bio").value,
    imageUrl: document.getElementById("imageUrl").value
  };

  const res = await fetch("/profile", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + token
    },
    body: JSON.stringify(data)
  });

  const msg = document.getElementById("message");

  if (res.ok) {
    msg.textContent = "Profile saved!";
  } else {
    msg.textContent = "Error saving profile.";
  }
});
