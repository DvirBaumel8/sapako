import { describeTarget } from './describeTarget';

describe('describeTarget', () => {
  it('names the host and database of a Neon connection string', () => {
    expect(
      describeTarget(
        'postgresql://neondb_owner:secret@ep-sparkling-sound.eu-central-1.aws.neon.tech/neondb?sslmode=require',
      ),
    ).toBe('neondb on ep-sparkling-sound.eu-central-1.aws.neon.tech');
  });

  it('never includes the password', () => {
    const described = describeTarget(
      'postgresql://neondb_owner:npg_supersecret@host.neon.tech/neondb',
    );

    expect(described).not.toContain('npg_supersecret');
  });

  it('never includes the user name either', () => {
    // The user is half a credential, and printing it teaches people that
    // pasting this line into a chat or an issue is harmless.
    const described = describeTarget(
      'postgresql://neondb_owner:secret@host.neon.tech/neondb',
    );

    expect(described).not.toContain('neondb_owner');
  });

  it('recognises a local database', () => {
    expect(describeTarget('postgresql://dvir@localhost:5432/sapako')).toBe(
      'sapako on localhost',
    );
  });

  it('says so when nothing is configured', () => {
    expect(describeTarget(undefined)).toBe('an unconfigured database');
  });

  it('does not throw on a connection string it cannot parse', () => {
    expect(describeTarget('not a url')).toBe('an unrecognised database');
  });
});
