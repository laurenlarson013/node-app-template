document.addEventListener('DOMContentLoaded', () => {
    const token = localStorage.getItem('jwtToken');
  
    if (!token) {
      window.location.href = '/';
      return;
    }
  
    const fullNameInput = document.getElementById('fullName');
    const emailInput = document.getElementById('email');
    const bioInput = document.getElementById('bio');
    const profilePhotoUrlInput = document.getElementById('profilePhotoUrl');
    const campusInput = document.getElementById('campus');
    const locationInput = document.getElementById('location');
    const saveProfileBtn = document.getElementById('saveProfileBtn');
    const updateCampusBtn = document.getElementById('updateCampusBtn');
    const profileMessage = document.getElementById('profileMessage');
  
    async function loadProfile() {
      try {
        const response = await fetch('/api/me', {
          method: 'GET',
          headers: {
            Authorization: token,
            'Content-Type': 'application/json'
          }
        });
  
        const data = await response.json();
  
        if (!response.ok) {
          profileMessage.textContent = data.message || 'Could not load profile.';
          return;
        }
  
        fullNameInput.value = data.full_name ?? '';
        emailInput.value = data.email ?? '';
        bioInput.value = data.bio ?? '';
        profilePhotoUrlInput.value = data.profile_photo_url ?? '';
        campusInput.value = data.campus ?? '';
        locationInput.value = data.location ?? '';
      } catch (error) {
        console.error('Error loading profile:', error);
        profileMessage.textContent = 'Error loading profile.';
      }
    }
  
    async function saveProfile() {
      try {
        const payload = {
          full_name: fullNameInput.value.trim(),
          bio: bioInput.value.trim(),
          campus: campusInput.value,
          location: locationInput.value.trim(),
          profile_photo_url: profilePhotoUrlInput.value.trim()
        };
  
        const response = await fetch('/api/me', {
          method: 'PUT',
          headers: {
            Authorization: token,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        });
  
        const data = await response.json();
  
        if (!response.ok) {
          profileMessage.textContent = data.message || 'Could not save profile.';
          return;
        }
  
        profileMessage.textContent = 'Profile updated!';
        await loadProfile();
      } catch (error) {
        console.error('Error saving profile:', error);
        profileMessage.textContent = 'Error saving profile.';
      }
    }
  
    if (saveProfileBtn) {
      saveProfileBtn.addEventListener('click', saveProfile);
    }
  
    if (updateCampusBtn) {
      updateCampusBtn.addEventListener('click', saveProfile);
    }
  
    loadProfile();
  });