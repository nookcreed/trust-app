CREATE TABLE trustdesk.app.facilities AS
SELECT
  unique_id, name, organization_type,
  address_stateOrRegion, address_city, address_zipOrPostcode, address_line1,
  latitude, longitude,
  numberDoctors, capacity, specialties, equipment,
  `procedure`, capability, description,
  officialWebsite, websites,
  distinct_social_media_presence_count, recency_of_page_update,
  operatorTypeId, area, facebookLink, phone_numbers, email, yearEstablished
FROM (
  SELECT *, ROW_NUMBER() OVER (PARTITION BY unique_id ORDER BY name) AS rn
  FROM (
    SELECT
      unique_id,
      REPLACE(COALESCE(name,''), chr(0), '') as name,
      REPLACE(COALESCE(organization_type,''), chr(0), '') as organization_type,
      REPLACE(COALESCE(address_stateOrRegion,''), chr(0), '') as address_stateOrRegion,
      REPLACE(COALESCE(address_city,''), chr(0), '') as address_city,
      REPLACE(COALESCE(address_zipOrPostcode,''), chr(0), '') as address_zipOrPostcode,
      REPLACE(COALESCE(address_line1,''), chr(0), '') as address_line1,
      latitude, longitude,
      REPLACE(COALESCE(numberDoctors,''), chr(0), '') as numberDoctors,
      REPLACE(COALESCE(capacity,''), chr(0), '') as capacity,
      REPLACE(COALESCE(specialties,''), chr(0), '') as specialties,
      REPLACE(COALESCE(equipment,''), chr(0), '') as equipment,
      REPLACE(COALESCE(`procedure`,''), chr(0), '') as `procedure`,
      REPLACE(COALESCE(capability,''), chr(0), '') as capability,
      REPLACE(COALESCE(description,''), chr(0), '') as description,
      REPLACE(COALESCE(officialWebsite,''), chr(0), '') as officialWebsite,
      REPLACE(COALESCE(websites,''), chr(0), '') as websites,
      REPLACE(COALESCE(distinct_social_media_presence_count,''), chr(0), '') as distinct_social_media_presence_count,
      REPLACE(COALESCE(recency_of_page_update,''), chr(0), '') as recency_of_page_update,
      REPLACE(COALESCE(operatorTypeId,''), chr(0), '') as operatorTypeId,
      REPLACE(COALESCE(area,''), chr(0), '') as area,
      REPLACE(COALESCE(facebookLink,''), chr(0), '') as facebookLink,
      REPLACE(COALESCE(phone_numbers,''), chr(0), '') as phone_numbers,
      REPLACE(COALESCE(email,''), chr(0), '') as email,
      REPLACE(COALESCE(yearEstablished,''), chr(0), '') as yearEstablished
    FROM databricks_virtue_foundation_dataset_dais_2026.virtue_foundation_dataset.facilities
  )
) WHERE rn = 1
