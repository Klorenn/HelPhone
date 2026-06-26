#![cfg(test)]

use super::*;
use soroban_sdk::{testutils::Address as _, Address, Env, String};

#[test]
fn creates_and_accepts_request() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(HelPhone, ());
    let client = HelPhoneClient::new(&env, &contract_id);

    let requester = Address::generate(&env);
    let responder = Address::generate(&env);

    let request_id = client.create_request(
        &requester,
        &12_345_678,
        &-76_543_210,
        &String::from_str(&env, "medical"),
        &String::from_str(&env, "Ana"),
        &String::from_str(&env, "@ana"),
    );

    assert_eq!(request_id, 1);
    assert_eq!(client.get_request_count(), 1);
    assert_eq!(client.get_active_requests().len(), 1);

    let request = client.get_request(&request_id).unwrap();
    assert_eq!(request.requester, requester);
    assert_eq!(request.status, Status::Pending);

    let responder_index = client.accept_request(
        &responder,
        &request_id,
        &12_346_000,
        &-76_543_000,
        &300,
    );

    assert_eq!(responder_index, 0);
    assert_eq!(client.get_responder_count(&request_id), 1);

    let accepted = client.get_request(&request_id).unwrap();
    assert_eq!(accepted.status, Status::Enroute);

    let saved_responder = client.get_responder(&request_id, &responder_index).unwrap();
    assert_eq!(saved_responder.responder, responder);
    assert_eq!(saved_responder.eta_seconds, 300);
}

#[test]
fn records_expert_verification_history() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(HelPhone, ());
    let client = HelPhoneClient::new(&env, &contract_id);

    let wallet = Address::generate(&env);

    let count = client.record_expert_verification(
        &wallet,
        &String::from_str(&env, "request_created"),
        &String::from_str(&env, "tx-abc123"),
        &String::from_str(&env, "nullifier-xyz"),
    );

    assert_eq!(count, 1);

    let records = client.get_expert_verifications(&wallet, &10);
    assert_eq!(records.len(), 1);

    let record = records.get(0).unwrap();
    assert_eq!(record.wallet, wallet);
    assert_eq!(record.action, String::from_str(&env, "request_created"));
    assert_eq!(record.tx_hash, String::from_str(&env, "tx-abc123"));
    assert_eq!(record.proof_fingerprint, String::from_str(&env, "nullifier-xyz"));
}
