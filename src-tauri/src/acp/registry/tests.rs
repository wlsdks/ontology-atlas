use super::*;
use crate::acp::launch::adapter_bin_name;

#[test]
fn the_registry_snapshot_is_loaded_and_every_entry_can_be_launched() {
    // An unreadable snapshot would make these checks pass on an empty set.
    let agents = registry();
    assert!(
        agents.len() >= 20,
        "registry snapshot is empty or too small: {}",
        agents.len()
    );

    for agent in agents {
        assert!(!agent.id.is_empty() && !agent.name.is_empty());
        match &agent.launch {
            RegistryLaunch::Npx { package, .. } => {
                // An unpinned adapter could silently speak a different protocol.
                assert!(
                    package.contains('@')
                        && package.rsplit('@').next().is_some_and(|v| v
                            .chars()
                            .next()
                            .is_some_and(|c| c.is_ascii_digit())),
                    "{} npx package has no version: {package}",
                    agent.id
                );
                assert!(
                    adapter_bin_name(package).is_some(),
                    "{}: cannot derive the executable name",
                    agent.id
                );
            }
            RegistryLaunch::Uvx { package, .. } => assert!(!package.is_empty()),
            RegistryLaunch::Binary { command, .. } => {
                assert!(!command.is_empty());
                assert!(
                    !command.starts_with("./"),
                    "{}: `./` was not stripped",
                    agent.id
                );
            }
        }
    }
}
