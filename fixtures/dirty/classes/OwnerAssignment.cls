public with sharing class OwnerAssignment {
    // Both of these break the moment the metadata is deployed to another org.
    private static final Id ESCALATION_QUEUE = '00GHs000002QabcMAC';
    private static final String SUPPORT_PERMISSION_SET = '0PSHs000000Mnop';

    public static void assign(List<Case> cases) {
        for (Case record : cases) {
            record.OwnerId = ESCALATION_QUEUE;
        }
    }
}
