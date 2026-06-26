// Coordinate encoding (avoids negative integers):
//   stored_lon = floor(real_lon * 1e7) + 1_800_000_000   range [0, 3_600_000_000]
//   stored_lat = floor(real_lat * 1e7) +   900_000_000   range [0, 1_800_000_000]
// Both fit in u64.

fn main(
    // Private witnesses -- never leave the client
    user_x: u64,      // encoded longitude
    user_y: u64,      // encoded latitude
    secret_id: Field, // user private seed

    // Public inputs -- committed to the proof, verified on-chain
    box_x_min: pub u64,
    box_x_max: pub u64,
    box_y_min: pub u64,
    box_y_max: pub u64,
    campaign_id:       pub Field,
    recipient_address: pub Field, // Stellar address as Field (decoded StrKey bytes -> Field)
) -> pub Field {

    // 1. Geofencing: user must be inside the bounding box
    assert(user_x >= box_x_min, "Longitude below zone minimum");
    assert(user_x <= box_x_max, "Longitude above zone maximum");
    assert(user_y >= box_y_min, "Latitude below zone minimum");
    assert(user_y <= box_y_max, "Latitude above zone maximum");

    // 2. Nullifier = Poseidon2(secret_id, campaign_id)
    //    One valid claim per user per campaign. Unique without revealing identity.
    //    The smart contract stores this and rejects duplicates.
    // Poseidon2 permutation requires width-4 state (bb v0.87.0)
    let state = std::hash::poseidon2_permutation([secret_id, campaign_id, 0, 0], 4);
    let nullifier = state[0];

    // 3. Recipient binding
    //    recipient_address is a public input: the proof mathematically commits to it.
    //    Any attempt to swap the address after proof generation fails on-chain.
    assert(recipient_address != 0);

    nullifier
}
