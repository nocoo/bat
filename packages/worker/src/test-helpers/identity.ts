import { exportJWK, generateKeyPair, SignJWT } from "jose";

const pair = generateKeyPair("RS256", { extractable: true });
export async function fixtureIdentity() {
	const keys = await pair;
	const jwt = await new SignJWT({ email: "operator@example.test", name: "Morgan Chen" })
		.setProtectedHeader({ alg: "RS256" })
		.setIssuer("https://bat-fixture.invalid")
		.setAudience("bat-test")
		.setIssuedAt()
		.setExpirationTime("1h")
		.sign(keys.privateKey);
	return {
		jwt,
		env: {
			CF_ACCESS_TEAM_DOMAIN: "bat-fixture.invalid",
			CF_ACCESS_AUD: "bat-test",
			CF_ACCESS_LOCAL_JWKS: JSON.stringify({ keys: [await exportJWK(keys.publicKey)] }),
			CONNECT_MANAGERS: "email:operator@example.test",
		},
	};
}
