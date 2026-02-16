import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, BigIntColumn as BigIntColumn_, IntColumn as IntColumn_, StringColumn as StringColumn_, Index as Index_} from "@subsquid/typeorm-store"

@Entity_()
export class ApprovalEvent {
    constructor(props?: Partial<ApprovalEvent>) {
        Object.assign(this, props)
    }

    @PrimaryColumn_()
    id!: string

    @BigIntColumn_({nullable: false})
    amount!: bigint

    @IntColumn_({nullable: false})
    timestamp!: number

    @Index_()
    @StringColumn_({nullable: false})
    owner!: string

    @Index_()
    @StringColumn_({nullable: false})
    spender!: string
}
