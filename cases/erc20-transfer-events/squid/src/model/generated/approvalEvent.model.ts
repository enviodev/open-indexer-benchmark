import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, Index as Index_} from "typeorm"
import * as marshal from "./marshal"

@Entity_()
export class ApprovalEvent {
    constructor(props?: Partial<ApprovalEvent>) {
        Object.assign(this, props)
    }

    @PrimaryColumn_()
    id!: string

    @Column_("numeric", {transformer: marshal.bigintTransformer, nullable: false})
    amount!: bigint

    @Column_("int4", {nullable: false})
    timestamp!: number

    @Index_()
    @Column_("text", {nullable: false})
    owner!: string

    @Index_()
    @Column_("text", {nullable: false})
    spender!: string
}
