import { getRepository } from 'typeorm'
import { Sequence } from './Sequence'
import { AssocManyAttribute } from './AssocManyAttribute'
import { AssocOneAttribute } from './AssocOneAttribute'
import { FactoryAttribute } from './FactoryAttribute'

export interface IConstructable<T> {
  new(): T
}

export type Attrs<U> = Array<[keyof U,
  Sequence<U[keyof U]> |
  AssocManyAttribute<any> |
  AssocOneAttribute<U[keyof U]> |
  FactoryAttribute<any>]>

export class Factory<T> {
  public Obj: IConstructable<T>
  public attrs: Attrs<T>
  private privateRepository: any

  constructor(Obj: IConstructable<T>, attrs?: Attrs<T> ) {
    this.Obj = Obj
    this.attrs = attrs || []
  }

  private get repository() {
    this.privateRepository = this.privateRepository || getRepository(this.Obj)
    return this.privateRepository
  }

  public clone() {
    return new Factory<T>(this.Obj, this.attrs)
  }
  public sequence(name: keyof T, seqFunc: (i: number) => T[keyof T]) {
    this.attrs.push([name, new Sequence<T[keyof T]>(seqFunc)])
    return this.clone()
  }

  public attr(name: keyof T, value: T[keyof T]) {
    this.attrs.push([name, new FactoryAttribute<T[keyof T]>(value)])
    return this.clone()
  }

  public assocMany<U>(name: keyof T, factory: Factory<U>, size: number = 1) {
    this.attrs.push([name, new AssocManyAttribute<U>(factory, size)])
    return this.clone()
  }

  public assocOne(name: keyof T, factory: Factory<T[keyof T]>) {
    this.attrs.push([name, new AssocOneAttribute<T[keyof T]>(factory)])
    return this.clone()
  }

  public build(attributes: {[k in keyof T]?: T[k]} = {}): T {
    const ignoreKeys = Object.keys(attributes)
    const obj = this.assignAttrs(new this.Obj(), ignoreKeys)
    return this.assignPassedAttrs(obj, attributes)
  }

  public buildList(size: number): T[] {
    return Array.from({ length: size }, () => this.build())
  }

  public async create(attributes: {[k in keyof T]?: T[k]} = {}): Promise<T> {
    const ignoreKeys = Object.keys(attributes)
    const obj = await this.assignAsyncAttrs(new this.Obj(), ignoreKeys)
    const objWithAttrs = this.assignPassedAttrs(obj, attributes)
    return this.repository.save(objWithAttrs)
  }

  public async createList(size: number): Promise<T[]> {
    const objects = Array.from({ length: size }, () => this.create())
    const list = await Promise.all(objects)
    return list
  }

  private assignAttrs(obj: T, ignoreKeys: string[]): T {
    return this.attrs.reduce((sum, [key, attribute]) => {
      if (ignoreKeys.indexOf(key) === -1) {
        sum[key] = attribute.value()
      }
      return sum
    }, obj)
  }

  private assignAsyncAttrs(obj: T, ignoreKeys: string[]): Promise<T> {
    return this.attrs.reduce((sum, [key, factory]) => {
      return sum.then(async (s) => {
        if (ignoreKeys.indexOf(key) === -1) {
          s[key] = await factory.asyncValue()
        }
        return s
      })
    }, Promise.resolve(obj))
  }

  private assignPassedAttrs(obj: T, attrs: {[k in keyof T]?: T[k]}) {
    for (let key in attrs) {
      const val = attrs[key]
      if (val) { obj[key] = val }
    }
    return obj
  }
}