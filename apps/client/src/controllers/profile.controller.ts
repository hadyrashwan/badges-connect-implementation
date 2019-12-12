import * as faker from 'faker';
import { Issuer, generators } from 'openid-client';
import { saveDB, getWhere, getOneWhere } from '../utils/mongo';
import { IProfile } from '../types/profile.type';
import { Request } from 'express';

// TODO refactor the request into small ones and use es6+ syntax
export const get = async (req: Request, res) => {
  const { id: uid } = req.params;
  const [profile, clients, wellKnows] = await Promise.all([
    getOneWhere({ id: uid }, 'profiles'),
    getWhere({}, 'clients'),
    getWhere({}, 'wellKnows')
  ]);

  // create the wellknown map
  const wellKnownMap = {};
  for (let i = 0; i < wellKnows.length; i++) {
    wellKnownMap[wellKnows[i]._id] = wellKnows[i];
  }

  const items = await Promise.all(
    clients.map(i => getClient(wellKnownMap, i, uid, req.headers.host))
  );

  // TODO add assertion data
  // res.send({ profile, clients: items });

  res.render('profile', { profile, clients: items });
};

const getClient = async (wellKnownMap, i, uid, host) => {
  const issuer = new Issuer(wellKnownMap[i._id]);
  const client = new issuer.Client(i);

  // generate the code challenge
  const code_verifier = generators.codeVerifier();
  const state = generators.state();
  const code_challenge = generators.codeChallenge(code_verifier);

  // using the wellKnown ID
  const redirect_uri = `http://${host}/callback/${i._id}`;

  // generate the redirect url
  const authUrl = client.authorizationUrl({
    redirect_uri,
    code_challenge,
    state,
    code_challenge_method: 'S256',
    scope:
      'openid https://purl.imsglobal.org/spec/ob/v2p1/scope/assertion.readonly'
  });

  await saveDB({ code_verifier, code_challenge, uid, state }, 'state');

  i.authUrl = authUrl;
  return i;
};
export const generate = async (req, res) => {
  try {
    const firstName = faker.name.firstName();
    const lastName = faker.name.lastName();

    const profile: IProfile = {
      firstName,
      lastName,
      photo: faker.image.avatar(),
      jobTitle: faker.name.jobTitle(),
      password: faker.internet.password(),
      id: faker.random.uuid(),
      email: faker.internet.email(firstName, lastName)
    };

    await saveDB({ ...profile, _id: profile.id }, 'profiles');
    res.send(profile);
  } catch (e) {
    console.log(e);
    res.status(500).send({ msg: 'can not generate the profile ' });
  }
};

export const redirect = (req, res) => {
  const { selectedClient } = req.body;
  console.log(selectedClient);
  res.redirect(selectedClient);
};
