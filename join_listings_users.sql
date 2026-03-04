SELECT 
    l.listing_id,
    l.title,
    l.price,
    l.trade_option,
    l.item_condition,
    l.pickup_details,
    l.listing_description,
    l.photos,
    u.full_name,
    u.profile_photo_url,
    u.campus
FROM listings l
JOIN user u
    ON l.user_email = u.email;
